//
//  JSPiPadApp.swift
//  JSPiPad
//
//  SwiftUI entry point. Starts the embedded Hummingbird engine in a
//  detached background task, then displays the React UI in WKWebView.
//
import SwiftUI
import AVFoundation

@main
struct JSPiPadApp: App {

    init() {
        // Activate the audio session up front. WebKit otherwise
        // activates it lazily when the page first renders *audible*
        // output, and that activation (~hundreds of ms) landed right
        // after the first on-screen key tap — visible as a delay
        // before the next key highlighted. .playback ignores the
        // ring/silent switch (it's a piano app); .mixWithOthers
        // avoids killing background music at launch.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("JSPiPadApp: AVAudioSession activation failed — %@",
                  error.localizedDescription)
        }

        Task.detached(priority: .background) {
            await EngineHost.shared.ensureStarted()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
                // The on-screen piano sits in the bottom edge-swipe
                // zone; deferral keeps mid-session presses near the
                // edges from fighting Dock/Slide Over swipes. (It
                // does NOT stop the once-per-launch system gesture
                // gate — the web UI's "Tap anywhere to begin" overlay
                // absorbs that.) Cost: system edge swipes need a
                // deliberate two-stage swipe, standard for immersive
                // apps.
                .defersSystemGestures(on: .all)
        }
    }
}
