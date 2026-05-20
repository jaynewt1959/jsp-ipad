//
//  MidiInput.swift
//  jsp-engine
//
//  CoreMIDI listener that translates incoming MIDI 1.0 channel-voice
//  messages into pure-Swift `NoteEvent`s and surfaces them via an
//  `AsyncStream`.
//
//  Design notes
//  ------------
//  * Not an actor and not `@MainActor`. CoreMIDI calls our receive
//    block from a real-time audio thread, so we cannot enter any
//    actor synchronously from there. Internal state is guarded by
//    a single `NSLock`.
//  * `AsyncStream.Continuation.yield(_:)` is documented as safe to
//    call from any thread, so we yield directly from the receive
//    block without an extra hop.
//  * Hot-plug of MIDI sources is handled via the client's
//    notification block. New sources auto-connect on
//    `msgObjectAdded`/`msgSetupChanged`.
//
import Foundation
import JSPCore
#if canImport(CoreMIDI)
import CoreMIDI
#endif

public final class MidiInput: @unchecked Sendable {

    // MARK: - State (lock-protected)

    private let lock = NSLock()

    #if canImport(CoreMIDI)
    private var client: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var connectedSources: Set<MIDIEndpointRef> = []
    #endif

    private var continuation: AsyncStream<NoteEvent>.Continuation?
    private var running: Bool = false
    private var lastError: String?

    public init() {}

    // MARK: - Public surface

    /// Latest setup error, if any. Useful for the snapshot's debug
    /// log.
    public func currentError() -> String? {
        lock.lock(); defer { lock.unlock() }
        return lastError
    }

    /// Whether `start()` has been called and CoreMIDI setup succeeded.
    public func isRunning() -> Bool {
        lock.lock(); defer { lock.unlock() }
        return running
    }

    /// Snapshot of currently-connected MIDI source display names.
    public func currentSourceNames() -> [String] {
        lock.lock(); defer { lock.unlock() }
        #if canImport(CoreMIDI)
        return connectedSources
            .map { displayName(of: $0) }
            .sorted()
        #else
        return []
        #endif
    }

    /// Returns an AsyncStream of note events. Only one active stream
    /// is supported in v0; calling `events()` again replaces the
    /// continuation (the previous stream finishes).
    public func events() -> AsyncStream<NoteEvent> {
        AsyncStream<NoteEvent> { newContinuation in
            self.lock.lock()
            self.continuation?.finish()
            self.continuation = newContinuation
            self.lock.unlock()

            newContinuation.onTermination = { [weak self] _ in
                guard let self else { return }
                self.lock.lock()
                self.continuation = nil
                self.lock.unlock()
            }
        }
    }

    /// Spin up the CoreMIDI client and input port, and connect any
    /// sources that already exist. Idempotent.
    public func start() {
        #if canImport(CoreMIDI)
        lock.lock()
        guard !running else { lock.unlock(); return }
        lock.unlock()

        let clientName = "JSP MIDI Client" as CFString
        var newClient: MIDIClientRef = 0
        let clientStatus = MIDIClientCreateWithBlock(clientName, &newClient) { [weak self] notificationPtr in
            guard let self else { return }
            let messageID = notificationPtr.pointee.messageID
            switch messageID {
            case .msgObjectAdded, .msgObjectRemoved, .msgSetupChanged:
                self.refreshSources()
            default:
                break
            }
        }
        guard clientStatus == noErr else {
            recordError("MIDIClientCreateWithBlock failed: \(clientStatus)")
            return
        }

        let portName = "JSP Input Port" as CFString
        var newPort: MIDIPortRef = 0
        let portStatus = MIDIInputPortCreateWithProtocol(
            newClient,
            portName,
            ._1_0,
            &newPort
        ) { [weak self] eventListPtr, _ in
            self?.dispatchEventList(eventListPtr)
        }
        guard portStatus == noErr else {
            recordError("MIDIInputPortCreateWithProtocol failed: \(portStatus)")
            MIDIClientDispose(newClient)
            return
        }

        lock.lock()
        client = newClient
        inputPort = newPort
        running = true
        lock.unlock()

        // Initial source attach happens after `running = true` so a
        // subsequent refresh can find the port.
        refreshSources()
        #else
        recordError("CoreMIDI not available on this platform")
        #endif
    }

    /// Tear down the client/port. Idempotent.
    public func stop() {
        #if canImport(CoreMIDI)
        lock.lock()
        guard running else { lock.unlock(); return }
        let port = inputPort
        let cli = client
        let toDisconnect = connectedSources
        connectedSources.removeAll()
        inputPort = 0
        client = 0
        running = false
        lock.unlock()

        for source in toDisconnect {
            MIDIPortDisconnectSource(port, source)
        }
        if port != 0 { MIDIPortDispose(port) }
        if cli != 0 { MIDIClientDispose(cli) }
        #endif
    }

    // MARK: - CoreMIDI plumbing

    #if canImport(CoreMIDI)
    private func refreshSources() {
        lock.lock()
        guard running else { lock.unlock(); return }
        let port = inputPort
        var live: Set<MIDIEndpointRef> = []
        for i in 0..<MIDIGetNumberOfSources() {
            let s = MIDIGetSource(i); if s != 0 { live.insert(s) }
        }
        let toRemove = connectedSources.subtracting(live)
        for s in toRemove {
            MIDIPortDisconnectSource(port, s)
            connectedSources.remove(s)
        }
        for s in live where !connectedSources.contains(s) {
            if MIDIPortConnectSource(port, s, nil) == noErr {
                connectedSources.insert(s)
            }
        }
        lock.unlock()
    }

    private func dispatchEventList(_ listPtr: UnsafePointer<MIDIEventList>) {
        // CoreMIDI hands us an `UnsafePointer<MIDIEventList>` whose
        // `pointee` is read-only, but the underlying storage is in
        // fact a stable buffer we may iterate. Reinterpret as mutable
        // so we can address the inline `packet` member, then walk the
        // buffer with `MIDIEventPacketNext`.
        let count = listPtr.pointee.numPackets
        let mutListPtr = UnsafeMutablePointer(mutating: listPtr)
        withUnsafePointer(to: &mutListPtr.pointee.packet) { firstPacketPtr in
            var packetPtr: UnsafePointer<MIDIEventPacket> = firstPacketPtr
            for _ in 0..<count {
                parsePacket(packetPtr.pointee)
                packetPtr = UnsafePointer(
                    MIDIEventPacketNext(UnsafeMutablePointer(mutating: packetPtr))
                )
            }
        }
    }

    private func parsePacket(_ packet: MIDIEventPacket) {
        // Each MIDI 1.0 channel-voice UMP message is one 32-bit word.
        let words = withUnsafeBytes(of: packet.words) { rawBuffer -> [UInt32] in
            let buffer = rawBuffer.bindMemory(to: UInt32.self)
            let n = Int(min(packet.wordCount, UInt32(buffer.count)))
            return Array(buffer.prefix(n))
        }
        for word in words {
            let byte0 = UInt8((word >> 24) & 0xFF)
            let byte1 = UInt8((word >> 16) & 0xFF)
            let byte2 = UInt8((word >>  8) & 0xFF)
            let byte3 = UInt8( word        & 0xFF)
            guard (byte0 & 0xF0) == 0x20 else { continue }
            let status = byte1 & 0xF0
            let note = Int(byte2)
            let velocity = Int(byte3)
            switch status {
            case 0x90 where velocity > 0:
                emit(NoteEvent(note: note, velocity: velocity, isOn: true,  timestampNs: packet.timeStamp))
            case 0x90: // note-on with velocity 0 == note-off
                emit(NoteEvent(note: note, velocity: 0, isOn: false, timestampNs: packet.timeStamp))
            case 0x80:
                emit(NoteEvent(note: note, velocity: velocity, isOn: false, timestampNs: packet.timeStamp))
            default:
                continue
            }
        }
    }

    private func displayName(of endpoint: MIDIEndpointRef) -> String {
        var unmanaged: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &unmanaged)
        guard status == noErr, let cf = unmanaged?.takeRetainedValue() else { return "unknown" }
        return cf as String
    }
    #endif

    // MARK: - Helpers

    private func emit(_ event: NoteEvent) {
        let cont: AsyncStream<NoteEvent>.Continuation? = {
            lock.lock(); defer { lock.unlock() }
            return continuation
        }()
        cont?.yield(event)
    }

    private func recordError(_ message: String) {
        lock.lock(); defer { lock.unlock() }
        lastError = message
        FileHandle.standardError.write(Data("MidiInput error: \(message)\n".utf8))
    }
}

