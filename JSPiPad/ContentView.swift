//
//  ContentView.swift
//  JSPiPad
//
//  Full-screen WKWebView that loads the React UI from the embedded
//  Hummingbird server (EngineHost picks the port, 8089 first).
//
//  Startup flow: poll EngineHost.shared.state until the server
//  reports running, confirm liveness via /healthz, then load the
//  page. If the engine fails — or doesn't come up within the
//  timeout — show an error screen with a Retry button instead of
//  spinning forever.
//
import SwiftUI
import WebKit

struct ContentView: View {

    private enum Phase: Equatable {
        case waiting
        case ready(port: Int)
        case failed(message: String)
    }

    /// How long to wait for the engine before declaring failure.
    private static let startupTimeout: TimeInterval = 12

    @State private var phase: Phase = .waiting
    /// Bumped by Retry to re-run the startup task.
    @State private var attempt = 0

    var body: some View {
        switch phase {
        case .ready(let port):
            WebViewContainer(port: port)
                .ignoresSafeArea()
        case .waiting:
            splash {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
            }
            .task(id: attempt) { await waitForServer() }
        case .failed(let message):
            splash {
                VStack(spacing: 14) {
                    Text("Something went wrong while starting the practice engine.")
                        .font(.callout)
                        .foregroundColor(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                    Button("Try Again") {
                        phase = .waiting
                        attempt += 1
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: 420)
            }
        }
    }

    /// Shared splash chrome (launch background, icon, title) with a
    /// caller-supplied footer: a spinner while waiting, error + Retry
    /// on failure.
    private func splash<Footer: View>(@ViewBuilder footer: () -> Footer) -> some View {
        Color("LaunchBackground")
            .ignoresSafeArea()
            .overlay(
                VStack(spacing: 24) {
                    Image("LaunchIcon")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 180, height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
                    Text("JSP")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    footer()
                }
                .padding(32)
            )
    }

    private func waitForServer() async {
        await EngineHost.shared.ensureStarted()
        let deadline = Date().addingTimeInterval(Self.startupTimeout)
        while Date() < deadline {
            if Task.isCancelled { return }
            switch await EngineHost.shared.state {
            case .running(let port):
                if await isHealthy(port: port) {
                    phase = .ready(port: port)
                    return
                }
            case .failed(let message):
                phase = .failed(message: message)
                return
            case .idle, .starting:
                break
            }
            try? await Task.sleep(nanoseconds: 200_000_000) // 200 ms
        }
        phase = .failed(message: "The engine didn't respond in time.")
    }

    private func isHealthy(port: Int) async -> Bool {
        guard let url = URL(string: "http://localhost:\(port)/healthz"),
              let (_, response) = try? await URLSession.shared.data(from: url)
        else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }
}

// MARK: -

struct WebViewContainer: UIViewRepresentable {

    let port: Int

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = .black
        webView.isOpaque = false
        if let url = URL(string: "http://localhost:\(port)/") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
