//
//  JSPiPadApp.swift
//  JSPiPad
//
//  SwiftUI entry point. Starts the embedded Hummingbird engine in a
//  detached background task, then displays the React UI in WKWebView.
//
import SwiftUI

@main
struct JSPiPadApp: App {

    init() {
        Task.detached(priority: .background) {
            await EngineHost.shared.ensureStarted()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
        }
    }
}
