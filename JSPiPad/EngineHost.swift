//
//  EngineHost.swift
//  JSPiPad
//
//  Starts the in-process Hummingbird server, CoreMIDI listener, and
//  SessionCoordinator. This is the iPad equivalent of main.swift in
//  the Mac CLI engine — same logic, no CLI argument parsing.
//
//  Static files (web/dist) are served from the app bundle.
//  Port is hardcoded to 8089.
//
import Foundation
import Hummingbird
import HummingbirdWebSocket

actor EngineHost {

    static let shared = EngineHost()
    private let port = 8089

    // Runs forever — call once from JSPiPadApp.init via Task.detached.
    func start() async {
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

        let config = ServerConfig(port: port, staticDir: staticDir, devMode: false)

        do {
            let app = try makeApplication(config: config, webSocketRouter: webSocketRouter)
            try await app.runService()
        } catch {
            // Log but don't crash — server startup failure is visible
            // via the WKWebView not loading.
            NSLog("EngineHost: server failed — %@", error.localizedDescription)
        }
    }
}
