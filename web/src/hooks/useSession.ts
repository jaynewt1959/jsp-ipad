import { useEffect, useMemo, useRef, useState } from "react";
import {
  JspClient,
  defaultWebSocketUrl,
  type ConnectionStatus
} from "../api/ws";
import type { Command, Snapshot, DebugLogMessage } from "../types";

/// Single source of truth for the page: subscribes to the engine
/// WebSocket and surfaces the latest snapshot + connection status.
export function useSession(url: string = defaultWebSocketUrl()) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "connecting" });
  const [debugLog, setDebugLog] = useState<DebugLogMessage | null>(null);
  const clientRef = useRef<JspClient | null>(null);
  const prevStepRef = useRef<number | null>(null);

  useEffect(() => {
    const client = new JspClient({
      url,
      onSnapshot: (s) => setSnapshot(s),
      onDebugLog: (log) => setDebugLog(log),
      onStatus: (s) => setStatus(s)
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [url]);

  // Auto-clear the debug overlay whenever the lesson rewinds to step 0
  // (covers both the C3+C4 gesture and a fresh startLesson).
  useEffect(() => {
    const step = snapshot?.lesson.currentStepIndex ?? null;
    if (step === 0 && prevStepRef.current !== null && prevStepRef.current > 0) {
      setDebugLog(null);
    }
    prevStepRef.current = step;
  }, [snapshot?.lesson.currentStepIndex]);

  const send = useMemo(
    () => (cmd: Command) => clientRef.current?.send(cmd),
    []
  );

  const clearDebugLog = useMemo(() => () => setDebugLog(null), []);

  return { snapshot, status, send, debugLog, clearDebugLog } as const;
}
