//
//  EngineHost.swift
//  JSPiPad
//
//  Starts the in-process Hummingbird server, CoreMIDI listener, and
//  SessionCoordinator. This is the iPad equivalent of main.swift in
//  the Mac CLI engine — same logic, no CLI argument parsing.
//
//  Static files (web/dist) are served from the app bundle.
//  Ports 8089 → 8090 → 8091 are tried in order; ContentView reads
//  the actual port from `state` rather than hardcoding it.
//
import Foundation
import Hummingbird
import HummingbirdWebSocket

actor EngineHost {

    static let shared = EngineHost()

    /// Lifecycle of the embedded server, observed by ContentView.
    enum State {
        case idle
        case starting
        case running(port: Int)
        case failed(String)
    }

    private(set) var state: State = .idle

    /// Ports tried in order. 8089 is the historical default; the
    /// fallbacks cover the unlikely case where another app on the
    /// device has already bound it (loopback ports are shared
    /// device-wide on iOS).
    private static let candidatePorts = [8089, 8090, 8091]

    /// True while a serve loop is active (starting or running).
    private var serving = false

    /// Start the engine unless it is already starting/running.
    /// Idempotent — called from JSPiPadApp.init and the Retry button.
    func ensureStarted() {
        guard !serving else { return }
        serving = true
        state = .starting
        Task { await self.run() }
    }

    private func run() async {
        let hub         = WebSocketHub()
        let midi        = MidiInput()
        let coordinator = SessionCoordinator(hub: hub, midi: midi)

        // Build the WS router (same handler logic as mac main.swift).
        let webSocketRouter = Router(context: BasicWebSocketRequestContext.self)
        webSocketRouter.ws("/ws") { inbound, outbound, _ in
            let id = UUID()
            var continuation: AsyncStream<String>.Continuation!
            // .bufferingNewest(1): when the write task is busy, incoming
            // snapshots replace the pending one rather than queuing behind
            // it. The display always jumps to the current state rather than
            // replaying a backlog of stale intermediate snapshots.
            let outbox = AsyncStream<String>(bufferingPolicy: .bufferingNewest(1)) { c in continuation = c }
            await hub.register(WebSocketSubscription(id: id, outbox: continuation))
            defer { Task { await hub.unregister(id: id) } }

            Task { await coordinator.broadcastInitialSnapshot() }

            let decoder = JSONDecoder()
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    for await message in outbox {
                        try await outbound.write(.text(message))
                    }
                }
                group.addTask {
                    for try await message in inbound.messages(maxSize: 1 << 20) {
                        guard case .text(let text) = message else { continue }
                        guard let data = text.data(using: .utf8),
                              let cmd  = try? decoder.decode(InboundCommand.self, from: data)
                        else { continue }
                        switch CommandType(rawValue: cmd.type) {
                        case .startLesson:     await coordinator.handleStart()
                        case .restartLesson:   await coordinator.handleRestart(clearHistory: cmd.clearHistory ?? false)
                        case .stopMidi:        await coordinator.handleStopMidi()
                        case .requestDebugLog: await coordinator.handleRequestDebugLog()
                        case .setHandMode:
                            if let mode = cmd.handMode {
                                await coordinator.handleSetHandMode(mode)
                            }
                        case .setMetronome:
                            if let enabled = cmd.metronomeEnabled,
                               let bpm    = cmd.metronomeBpm {
                                await coordinator.handleSetMetronome(enabled: enabled, bpm: bpm)
                            }
                        case .setScale:
                            if let key = cmd.scaleKey {
                                await coordinator.handleSetScale(key)
                            }
                        case .setDirection:
                            if let dir = cmd.direction {
                                await coordinator.handleSetDirection(dir)
                            }
                        case .setActiveSource:
                            if let name = cmd.sourceName {
                                await coordinator.handleSetActiveSource(name)
                            }
                        case .startCalibration:  await coordinator.handleStartCalibration()
                        case .cancelCalibration: await coordinator.handleCancelCalibration()
                        case .skipCalibration:   await coordinator.handleSkipCalibration()
                        case .simulateNote:
                            if let note = cmd.note, let isOn = cmd.isOn {
                                await coordinator.handleSimulateNote(note: note, isOn: isOn)
                            }
                        case .ping, .none: break
                        }
                    }
                    continuation.finish()
                }
                try await group.next()
                group.cancelAll()
            }
        }

        // Locate web/dist inside the app bundle.
        // Use Bundle URL API first (handles iOS path quirks), fall back
        // to direct path concatenation. Log bundle contents on failure.
        let staticDir: String? = {
            // Primary: Bundle resource lookup for index.html inside dist/
            if let indexURL = Bundle.main.url(forResource: "index",
                                              withExtension: "html",
                                              subdirectory: "dist") {
                return indexURL.deletingLastPathComponent().path
            }
            // Fallback: direct path
            if let base = Bundle.main.resourcePath {
                let candidate = base + "/dist"
                if FileManager.default.fileExists(atPath: candidate) {
                    return candidate
                }
            }
            // Debug: list bundle top-level to diagnose missing dist
            if let base = Bundle.main.resourcePath,
               let items = try? FileManager.default.contentsOfDirectory(atPath: base) {
                NSLog("EngineHost: bundle contents: %@", items.joined(separator: ", "))
            }
            NSLog("EngineHost: web/dist not found — UI will not load")
            return nil
        }()

        // Try each candidate port until one serves. The bind happens
        // inside runService(), so `.running` is set optimistically;
        // ContentView confirms liveness via /healthz before loading
        // the UI, so a failed bind is never user-visible.
        var lastError = "The practice engine could not start."
        for port in Self.candidatePorts {
            do {
                let config = ServerConfig(port: port, staticDir: staticDir, devMode: false)
                let app = try makeApplication(config: config, webSocketRouter: webSocketRouter)
                state = .running(port: port)
                try await app.runService()
                // runService() returning means the server shut down.
                lastError = "The practice engine stopped unexpectedly."
            } catch {
                lastError = error.localizedDescription
                NSLog("EngineHost: port %ld failed — %@", port, error.localizedDescription)
            }
        }
        state = .failed(lastError)
        serving = false
    }
}
