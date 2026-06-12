import { useState, useEffect, useMemo } from "react";
import type { Command, Snapshot } from "../types";
import type { TimingResult, TimingStats } from "../hooks/useTiming";
import type { PlayMode } from "../hooks/usePersistedSettings";
import { getScaleDescriptor } from "../data/scales";
import { noteName, FLAT_KEY_SIGNATURES } from "../util/noteName";
import { compositeScore } from "../util/compositeScore";
import { tapsEnabled } from "../util/demoMode";
import { tapNoteOn, tapNoteOff } from "../audio/tapSynth";
import { HandStatusBadge } from "./HandStatusBadge";
import { KeyboardStrip } from "./KeyboardStrip";
import { KeyboardBar } from "./KeyboardBar";
import { ScaleScoreView } from "./score/ScaleScoreView";

interface Props {
  snapshot: Snapshot | null;
  send: (cmd: Command) => void;
  timing: TimingResult | null;
  timingStats: TimingStats;
  playMode: PlayMode;
  loopCountdown: number | null;
  /** Incremented on manual Reset; used to clear the latched completion display. */
  manualResetSeq: number;
}

// Keyboard range is computed dynamically from the active scale (see below).

/** One segment of the timing-stats line, colour-coded like the
 *  per-note timing feedback (amber = early, green = on time,
 *  orange = late). */
interface StatPart {
  kind: "early" | "ontime" | "late";
  text: string;
}

export function PracticePanel({ snapshot, send, timing, timingStats, playMode, loopCountdown, manualResetSeq }: Props) {
  const lesson = snapshot?.lesson;
  const step = snapshot?.lesson.currentStep ?? null;
  const handStatus = snapshot?.handStatus;

  const handsMode = lesson?.handsMode ?? "together";
  const showLeft  = handsMode !== "rightOnly";
  const showRight = handsMode !== "leftOnly";

  // Demo mode: with no physical keyboard active, the on-screen keys
  // are the input device.
  const tapInput = tapsEnabled(snapshot?.midi);

  // Keyboard range: one semitone buffer outside the full note span of the
  // current scale so highlighted keys are never flush against the edge.
  const scaleDesc = getScaleDescriptor(lesson?.key ?? "cMajor");
  const useFlats = FLAT_KEY_SIGNATURES.has(lesson?.key ?? "");
  const KEYBOARD_LOW  = Math.min(...scaleDesc.lhMidi, ...scaleDesc.rhMidi) - 1;
  const KEYBOARD_HIGH = Math.max(...scaleDesc.lhMidi, ...scaleDesc.rhMidi) + 1;


  const stepLabel = (() => {
    if (!lesson) return "—";
    if (lesson.isCompleted) return "Done";
    if (!step) return "—";
    if (handsMode === "leftOnly"  && step.leftNote  != null) return `Play ${noteName(step.leftNote, useFlats)}`;
    if (handsMode === "rightOnly" && step.rightNote != null) return `Play ${noteName(step.rightNote, useFlats)}`;
    // together: show both notes
    const parts: string[] = [];
    if (step.leftNote  != null) parts.push(noteName(step.leftNote, useFlats));
    if (step.rightNote != null) parts.push(noteName(step.rightNote, useFlats));
    return parts.length ? `Play ${parts.join(" + ")}` : "—";
  })();

  const progress = lesson && lesson.totalSteps > 0
    ? lesson.currentStepIndex / lesson.totalSteps
    : 0;

  // Augment note-press feedback with timing label when metronome is on.
  const rawFeedback = snapshot?.feedback ?? "";
  const feedbackWithTiming = (() => {
    if (timing && rawFeedback.startsWith("✓")) {
      return `${rawFeedback} · ${timing.label}`;
    }
    return rawFeedback || "\u00A0";
  })();

  // Colour the feedback text based on the most recent timing result.
  const feedbackColor = (() => {
    if (!timing || !rawFeedback.startsWith("✓")) return undefined;
    if (timing.quality === "onTime")   return "#16a34a"; // green-600
    if (timing.quality === "slightly") return "#d97706"; // amber-600
    return "#ea580c"; // orange-600  clearly off
  })();

  // Timing stats: show when there's enough data.
  // Always shown on completion; shown mid-lesson only once we have 5+ notes.
  // Memoised on primitives so the latch effect below doesn't loop on
  // a fresh array identity every render.
  const isCompleted = lesson?.isCompleted ?? false;
  const statsParts = useMemo<StatPart[] | null>(() => {
    if (timingStats.total === 0) return null;
    if (timingStats.total < 5 && !isCompleted) return null;
    const pct = (n: number) => `${Math.round(n / timingStats.total * 100)}%`;
    const parts: StatPart[] = [];
    if (timingStats.early  > 0) parts.push({ kind: "early",  text: `Early ${pct(timingStats.early)}` });
    parts.push({ kind: "ontime", text: `On time ${pct(timingStats.onTime)}` });
    if (timingStats.late   > 0) parts.push({ kind: "late",   text: `Late ${pct(timingStats.late)}` });
    return parts;
  }, [timingStats.early, timingStats.onTime, timingStats.late, timingStats.total, isCompleted]);

  // Shown in the feedback line when the lesson is complete.
  const completionFeedback = lesson?.isCompleted ? (() => {
    const mistakes = Object.values(snapshot?.mistakesByStep ?? {}).reduce((a, b) => a + b, 0);
    const skips = lesson.alreadySatisfiedCount ?? 0;
    const totalSteps = lesson.totalSteps;
    const precision = Math.round(totalSteps / (totalSteps + mistakes + skips) * 100);
    const elapsed = snapshot?.elapsedSec;
    const timeStr = elapsed != null
      ? `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`
      : null;
    const syncMs = lesson.avgSyncMs;
    const minSync = lesson.minSyncMs;
    const maxSync = lesson.maxSyncMs;
    const worstStep = lesson.worstSyncStep;
    // Note pair for the worst-sync step, e.g. "C4+C3"
    const worstNote = worstStep != null ? (() => {
      const rh = scaleDesc.rhMidi[worstStep];
      const lh = scaleDesc.lhMidi[worstStep];
      return rh != null && lh != null ? `${noteName(rh, useFlats)}+${noteName(lh, useFlats)}` : null;
    })() : null;
    const score = compositeScore(totalSteps, mistakes, skips, lesson.velocityCV, lesson.rhythmCV);
    const parts = [
      score != null ? `Score ${Math.round(score)}` : null,
      timeStr && `${timeStr}`,
      `${precision}% precision`,
      `${mistakes} mistake${mistakes === 1 ? "" : "s"}`,
      syncMs  != null ? `sync avg ±${Math.round(syncMs)}ms` : null,
      minSync != null ? `best ${Math.round(minSync)}ms` : null,
      maxSync != null ? `worst ${Math.round(maxSync)}ms${worstNote ? ` (${worstNote})` : ""}` : null,
      // Fixed-velocity input (on-screen taps, keyboards without touch
      // response) has no dynamics — mark evenness n/a rather than
      // showing a separate notice.
      lesson.fixedVelocity
        ? "evenness n/a"
        : lesson.velocityCV != null
          ? `evenness ${(100 - Math.min(lesson.velocityCV, 100)).toFixed(0)}%`
          : null,
      lesson.rhythmCV != null ? `rhythm ${(100 - Math.min(lesson.rhythmCV, 100)).toFixed(0)}%` : null,
    ].filter(Boolean).join(" \u00b7 ");
    const suffix = playMode === "once"
      ? " \u00b7 press Reset to begin again"
      : playMode === "loop"
        ? " \u00b7 next run starting\u2026"
        : " \u00b7 next scale starting\u2026";
    return `\u2713 Complete${parts ? ` \u2014 ${parts}` : ""}${suffix}`;
  })() : null;

  // ── Latch completion display until first note of new session ──────
  // Keeps the stats visible after loop/manual restart so the user can
  // read them. Cleared once the first MIDI note advances the step.
  const [latchedCompletion, setLatchedCompletion] = useState<string | null>(null);
  const [latchedStats, setLatchedStats] = useState<StatPart[] | null>(null);

  useEffect(() => {
    if (completionFeedback) {
      setLatchedCompletion(completionFeedback);
      setLatchedStats(statsParts);
    }
  }, [completionFeedback, statsParts]);

  // Clear on first note of new session (loop restart)
  const stepIndex = snapshot?.lesson.currentStepIndex ?? 0;
  useEffect(() => {
    if (!isCompleted && stepIndex > 0 && latchedCompletion) {
      setLatchedCompletion(null);
      setLatchedStats(null);
    }
  }, [isCompleted, stepIndex, latchedCompletion]);

  // Clear immediately on manual Reset (user is done with old run)
  useEffect(() => {
    if (manualResetSeq > 0) {
      setLatchedCompletion(null);
      setLatchedStats(null);
    }
  }, [manualResetSeq]);

  return (
    <main className="practice">
      {__DEV_TOOLS__ && (
        <div className="practice__debug-bar">Build: {__BUILD_TIME__}</div>
      )}
      <header className="practice__header">
        <h1 className="practice__step">{stepLabel}</h1>
        <div className="practice__progress" aria-hidden>
          <div
            className="practice__progress-bar"
            style={{ width: `${Math.min(1, progress) * 100}%` }}
          />
        </div>
      </header>

      <section
        className="practice__hands"
        style={!showLeft || !showRight ? { gridTemplateColumns: "1fr" } : undefined}
      >
        {showLeft && (
          <HandStatusBadge
            hand="left"
            status={handStatus?.left ?? { kind: "idle" }}
            expectedNote={step?.leftNote ?? null}
            expectedFinger={step?.leftFinger ?? null}
            useFlats={useFlats}
          />
        )}
        {showRight && (
          <HandStatusBadge
            hand="right"
            status={handStatus?.right ?? { kind: "idle" }}
            expectedNote={step?.rightNote ?? null}
            expectedFinger={step?.rightFinger ?? null}
            useFlats={useFlats}
          />
        )}
      </section>

      <section className="practice__score">
        <ScaleScoreView snapshot={snapshot} timing={timing} />
        {loopCountdown !== null && (
          <div className="loop-countdown" role="status" aria-live="polite">
            <span>⟳ Restarting in</span>
            <span key={loopCountdown} className="loop-countdown__number">{loopCountdown}</span>
          </div>
        )}
      </section>

      <section className="practice__keyboard">
        <KeyboardStrip
          lowestMidi={KEYBOARD_LOW}
          highestMidi={KEYBOARD_HIGH}
          highlightLeft={showLeft  ? (step?.leftNote   ?? null) : null}
          highlightRight={showRight ? (step?.rightNote  ?? null) : null}
          fingerLeft={showLeft  ? (step?.leftFinger  ?? null) : null}
          fingerRight={showRight ? (step?.rightFinger ?? null) : null}
          tappable={tapInput}
          onKey={(midi, isOn) => {
            // Audible feedback for every tap (wrong notes included),
            // like a real piano. Tap-only — physical keyboards make
            // their own sound.
            if (isOn) tapNoteOn(midi);
            else tapNoteOff(midi);
            send({ type: "simulateNote", note: midi, isOn });
          }}
        />
      </section>

      <section className="practice__feedback">
        <p style={feedbackColor ? { color: feedbackColor } : undefined}>
          {completionFeedback ?? latchedCompletion ?? feedbackWithTiming}
        </p>
        {(() => {
          const stats = statsParts ?? latchedStats;
          if (!stats) return null;
          return (
            <p className="practice__timing-stats">
              {stats.map((part, i) => (
                <span key={part.kind}>
                  {i > 0 && " \u00b7 "}
                  <span className={`practice__timing-stat--${part.kind}`}>{part.text}</span>
                </span>
              ))}
            </p>
          );
        })()}
      </section>

      <KeyboardBar snapshot={snapshot} send={send} />
    </main>
  );
}
