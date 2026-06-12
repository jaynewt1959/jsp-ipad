// Typed WebSocket client for the JSP engine.
//
// Connects to the engine's `/ws` endpoint, parses incoming JSON
// snapshots, and exposes a `send(command)` method for outbound
// commands. Reconnects with exponential backoff (capped at 5 s) so
// closing the iPad lid and reopening it does not require a page
// reload. (Real reconnect polish lands in phase 6 \u2014 this is the
// simple version.)

import type { Command, Snapshot, DebugLogMessage } from "../types";

export type ConnectionStatus =
  | { kind: "connecting" }
  | { kind: "open" }
  | { kind: "closed"; reason?: string };

export interface JspClientOptions {
  url: string;
  onSnapshot: (snapshot: Snapshot) => void;
  onDebugLog: (log: DebugLogMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export class JspClient {
  private ws: WebSocket | null = null;
  private closedByCaller = false;
  private retryDelayMs = 500;
  private readonly maxDelayMs = 5000;

  constructor(private readonly opts: JspClientOptions) {}

  connect(): void {
    this.closedByCaller = false;
    this.openSocket();
  }

  close(): void {
    this.closedByCaller = true;
    this.ws?.close();
    this.ws = null;
  }

  send(cmd: Command): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
    }
    // If the socket isn't open we silently drop. The user re-clicks.
    // Phase 6 may add a small queue.
  }

  private openSocket(): void {
    this.opts.onStatus({ kind: "connecting" });
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryDelayMs = 500;
      this.opts.onStatus({ kind: "open" });
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "snapshot") {
          this.opts.onSnapshot(msg as Snapshot);
        } else if (msg.type === "debugLog") {
          this.opts.onDebugLog(msg as DebugLogMessage);
        }
      } catch (err) {
        console.warn("ws: failed to parse message", err, ev.data);
      }
    };

    const onLost = (reason: string | undefined) => {
      if (this.ws !== ws) return; // already replaced
      this.ws = null;
      this.opts.onStatus({ kind: "closed", reason });
      if (!this.closedByCaller) {
        const delay = this.retryDelayMs;
        this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxDelayMs);
        setTimeout(() => this.openSocket(), delay);
      }
    };

    ws.onclose = (ev) => onLost(ev.reason || `closed (${ev.code})`);
    ws.onerror = () => onLost("error");
  }
}

/// Derive the WebSocket URL from the current page.
///
/// In production the embedded engine serves both the static UI and
/// `/ws` on the same loopback port (it binds 127.0.0.1 only), so we
/// can use `window.location.host` directly — whichever port the
/// engine actually bound, the page was loaded from it.
///
/// In dev mode the Vite server runs on :5173 but the engine's
/// WebSocket is on :8089. Rather than routing through Vite's proxy
/// (which breaks when the client is on a different host, e.g. iPad
/// on the LAN), we connect directly to the engine port on the same
/// hostname. (That LAN setup applies to the Mac dev engine, which
/// binds 0.0.0.0; the iPad engine is in-process only.)
export function defaultWebSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const pagePort = window.location.port;
  // Vite dev server default port — connect straight to the engine.
  const wsPort = pagePort === "5173" ? "8089" : pagePort;
  return `${proto}//${host}:${wsPort}/ws`;
}
