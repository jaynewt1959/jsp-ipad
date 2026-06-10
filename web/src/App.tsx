import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "./hooks/useSession";
import { useMetronome } from "./hooks/useMetronome";
import { useTiming } from "./hooks/useTiming";
import {
  usePersistedSettings, loadSavedPlayMode,
  loadSavedCycleOrder, loadSavedMinorVariant,
} from "./hooks/usePersistedSettings";
import type { PlayMode } from "./hooks/usePersistedSettings";
import type { CycleOrder } from "./data/cycleOrders";
import { buildCyclePool } from "./data/cycleOrders";
import { minorVariantOf, isMinorKey, type MinorVariant } from "./data/scales";
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

  // ── Play mode (Once / Loop / Cycle) ────────────────────────────────────
  const [playMode, setPlayMode] = useState<PlayMode>(loadSavedPlayMode);
  const [cycleOrder, setCycleOrder] = useState<CycleOrder>(loadSavedCycleOrder);
  const [minorVariant, setMinorVariant] = useState<MinorVariant>(loadSavedMinorVariant);
  const { send, persistPlayMode, persistCycleOrder, persistMinorVariant } =
    usePersistedSettings(sessionSend, status, snapshot, setPlayMode, setCycleOrder, setMinorVariant);
  const isCompleted = snapshot?.lesson.isCompleted ?? false;
  const [loopCountdown, setLoopCountdown] = useState<number | null>(null);
  // Incremented on manual Reset so PracticePanel can clear the latched
  // completion feedback immediately (loop restarts keep it visible).
  const [manualResetSeq, setManualResetSeq] = useState(0);

  // ── Stable refs for effect callbacks (avoids dep churn) ──────────────
  const sendRef = useRef(send);
  sendRef.current = send;

  // ── Cycle pool state ───────────────────────────────────────────────────
  const cyclePoolRef = useRef<string[]>([]);
  const cycleIndexRef = useRef(0);

  // Derive cycle scale type from the current key (major vs any minor form).
  const currentKey = snapshot?.lesson.key ?? "cMajor";
  const cycleScaleType = isMinorKey(currentKey) ? "minor" as const : "major" as const;
  // Which minor sub-type the cycle uses: the current key's own variant when on
  // a minor, otherwise the remembered selection.
  const cycleMinorVariant = minorVariantOf(currentKey) ?? minorVariant;

  // Rebuild pool when cycle settings change (or when entering cycle mode).
  const rebuildPool = useCallback((avoidKey?: string) => {
    cyclePoolRef.current = buildCyclePool(cycleScaleType, cycleOrder, currentKey, avoidKey, cycleMinorVariant);
    cycleIndexRef.current = 0;
  }, [cycleScaleType, cycleOrder, currentKey, cycleMinorVariant]);

  useEffect(() => {
    if (playMode === "cycle") rebuildPool();
  }, [playMode, cycleOrder, cycleScaleType, cycleMinorVariant]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Advance to the next scale in the cycle pool. Returns the new key. */
  const advanceCycle = useCallback((): string => {
    const pool = cyclePoolRef.current;
    if (pool.length === 0) {
      rebuildPool();
    }
    cycleIndexRef.current += 1;
    if (cycleIndexRef.current >= cyclePoolRef.current.length) {
      // Wrap: rebuild for random (re-shuffle), or loop back for ordered.
      // Pass the last key so random mode avoids repeating it.
      const lastKey = pool[pool.length - 1];
      rebuildPool(lastKey);
    }
    return cyclePoolRef.current[cycleIndexRef.current];
  }, [rebuildPool]);

  // ── Loop mode: 3-2-1 countdown then restart same scale ─────────────────
  useEffect(() => {
    if (playMode !== "loop" || !isCompleted) return;
    setLoopCountdown(3);
    const t1 = setTimeout(() => setLoopCountdown(2), 500);
    const t2 = setTimeout(() => setLoopCountdown(1), 1000);
    const t3 = setTimeout(() => {
      setLoopCountdown(null);
      send({ type: "restartLesson" });
    }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); setLoopCountdown(null); };
  }, [isCompleted, playMode, send]);

  // ── Cycle mode: check mistakes, then retry or advance ──────────────────
  // Mistake count as a stable primitive — avoids object-reference dep churn.
  const mistakeCount = isCompleted
    ? Object.values(snapshot?.mistakesByStep ?? {}).reduce((a, b) => a + b, 0)
    : 0;
  // Keep advanceCycle in a ref so the effect doesn't re-fire when the
  // pool rebuilds (which changes rebuildPool → advanceCycle references).
  const advanceCycleRef = useRef(advanceCycle);
  advanceCycleRef.current = advanceCycle;

  useEffect(() => {
    if (playMode !== "cycle" || !isCompleted) return;

    if (mistakeCount > 0) {
      // Retry same scale after a brief delay.
      showToast(`Try again — ${mistakeCount} mistake${mistakeCount === 1 ? "" : "s"}`, 1400);
      const t = setTimeout(() => {
        sendRef.current({ type: "restartLesson" });
      }, 1500);
      return () => clearTimeout(t);
    }

    // Zero mistakes — advance with 3-2-1 countdown.
    setLoopCountdown(3);
    const t1 = setTimeout(() => setLoopCountdown(2), 500);
    const t2 = setTimeout(() => setLoopCountdown(1), 1000);
    const t3 = setTimeout(() => {
      setLoopCountdown(null);
      const nextKey = advanceCycleRef.current();
      sendRef.current({ type: "setScale", scaleKey: nextKey });
      sendRef.current({ type: "restartLesson" });
    }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); setLoopCountdown(null); };
  }, [isCompleted, playMode, mistakeCount]); // eslint-disable-line react-hooks/exhaustive-deps

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
        playMode={playMode}
        onSetPlayMode={persistPlayMode}
        cycleOrder={cycleOrder}
        onSetCycleOrder={persistCycleOrder}
        minorVariant={minorVariant}
        onSetMinorVariant={persistMinorVariant}
        onReset={handleReset}
      />
      <PracticePanel snapshot={snapshot} timing={timing} timingStats={timingStats} playMode={playMode} loopCountdown={loopCountdown} manualResetSeq={manualResetSeq} />
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
