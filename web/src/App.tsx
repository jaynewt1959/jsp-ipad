import { useState, useEffect, useRef } from "react";
import { useSession } from "./hooks/useSession";
import { useMetronome } from "./hooks/useMetronome";
import { useTiming } from "./hooks/useTiming";
import { usePersistedSettings, loadSavedLoopMode } from "./hooks/usePersistedSettings";
import { Sidebar } from "./components/Sidebar";
import { PracticePanel } from "./components/PracticePanel";
import { DebugPanel } from "./components/DebugPanel";

export default function App() {
  const { snapshot, status, send: sessionSend, debugLog, clearDebugLog } = useSession();

  // ── Toast notification ─────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, durationMs = 2500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => { setToast(null); }, durationMs);
  };
  void showToast; // suppress unused-var warning while inactivity reset is disabled

  // ── Loop (auto-repeat) mode ───────────────────────────────────────────────
  const [loopMode, setLoopMode] = useState(loadSavedLoopMode);
  const { send, persistLoopMode } = usePersistedSettings(sessionSend, status, snapshot, setLoopMode);
  const isCompleted = snapshot?.lesson.isCompleted ?? false;
  const [loopCountdown, setLoopCountdown] = useState<number | null>(null);
  // Incremented on manual Reset so PracticePanel can clear the latched
  // completion feedback immediately (loop restarts keep it visible).
  const [manualResetSeq, setManualResetSeq] = useState(0);

  // When the lesson completes in loop mode, run a 3-2-1 countdown then restart.
  useEffect(() => {
    if (!loopMode || !isCompleted) return;
    setLoopCountdown(3);
    const t1 = setTimeout(() => setLoopCountdown(2), 500);
    const t2 = setTimeout(() => setLoopCountdown(1), 1000);
    const t3 = setTimeout(() => {
      setLoopCountdown(null);
      send({ type: "restartLesson" });
    }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); setLoopCountdown(null); };
  }, [isCompleted, loopMode, send]);

  // ── Inactivity auto-reset ──────────────────────────────────────────────
  // TEMPORARILY DISABLED for debugging. Re-enable by restoring the useEffect below.
  const lastNoteOnMs = snapshot?.lesson.lastNoteOnMs ?? null;
  const lessonActive = (snapshot?.midi.running ?? false) && !isCompleted;
  void lastNoteOnMs; void lessonActive; // suppress unused-var warnings while disabled

  const handleReset = () => {
    setManualResetSeq(s => s + 1);
    send({ type: "restartLesson", clearHistory: true });
  };

  const metro = snapshot?.metronome ?? { enabled: false, bpm: 80 };
  // lessonActive already computed above (used for inactivity timer too).
  // Clock skew: positive when Mac is ahead of iPad.
  // Used to align the AudioContext beat grid with the server's beat grid.
  const clockSkewMs = snapshot ? snapshot.serverTimeMs - Date.now() : 0;
  const { beatPhase } = useMetronome(
    metro.bpm,
    metro.enabled && lessonActive,
    snapshot?.lesson.lessonStartMs ?? 0,
    clockSkewMs
  );
  const { timing, stats: timingStats } = useTiming(snapshot);

  return (
    <div className="layout">
      <Sidebar
        snapshot={snapshot}
        connection={status}
        send={send}
        beatPhase={beatPhase}
        loopMode={loopMode}
        onSetLoopMode={persistLoopMode}
        onReset={handleReset}
      />
      <PracticePanel snapshot={snapshot} timing={timing} timingStats={timingStats} loopMode={loopMode} loopCountdown={loopCountdown} manualResetSeq={manualResetSeq} />
      {debugLog && (
        <DebugPanel log={debugLog} onClose={clearDebugLog} />
      )}
      {toast && (
        <div className="auto-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
