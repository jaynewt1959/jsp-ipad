//
//  ContentView.swift
//  JSPiPad
//
//  Full-screen WKWebView that loads the React UI from the embedded
//  Hummingbird server on localhost:8089.
//
//  Polls /healthz until the server is up, then loads the page.
//  This avoids a hard-coded startup delay.
//
import SwiftUI
import WebKit

struct ContentView: View {
    @State private var serverReady = false

    var body: some View {
        Group {
            if serverReady {
                WebViewContainer()
                    .ignoresSafeArea()
            } else {
                Color.black
                    .ignoresSafeArea()
                    .overlay(
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    )
                    .task { await waitForServer() }
            }
        }
    }

    private func waitForServer() async {
        let healthURL = URL(string: "http://localhost:8089/healthz")!
        while true {
            if let (_, response) = try? await URLSession.shared.data(from: healthURL),
               (response as? HTTPURLResponse)?.statusCode == 200 {
                serverReady = true
                return
            }
            try? await Task.sleep(nanoseconds: 200_000_000) // 200 ms
        }
    }
}

// MARK: -

struct WebViewContainer: UIViewRepresentable {

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.load(URLRequest(url: URL(string: "http://localhost:8089/")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
