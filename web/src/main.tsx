import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { warmUpTapSynth } from "./audio/tapSynth";

// Start the audio pipeline before first render — the WKWebView host
// permits autoplay, and doing it this early hides the system
// audio-session activation behind page load (see tapSynth.ts).
warmUpTapSynth();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing #root element in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
