import type { Snapshot } from "../types";
import type { TimingResult, TimingStats } from "../hooks/useTiming";
import { getScaleDescriptor } from "../data/scales";
import { noteName, FLAT_KEY_SIGNATURES } from "../util/noteName";
import { HandStatusBadge } from "./HandStatusBadge";
import { KeyboardStrip } from "./KeyboardStrip";
import { ScaleScoreView } from "./score/ScaleScoreView";

interface Props {
  snapshot: Snapshot | null;
  timing: TimingResult | null;
  timingStats: TimingStats;
  loopMode: boolean;
  loopCountdown: number | null;
}

// Keyboard range is computed dynamically from the active scale (see below).

export function PracticePanel({ snapshot, timing, timingStats, loopMode, loopCountdown }: Props) {
  const lesson = snapshot?.lesson;
  const step = snapshot?.lesson.currentStep ?? null;
  const handStatus = snapshot?.handStatus;

  const handsMode = lesson?.handsMode ?? "together";
  const showLeft  = handsMode !== "rightOnly";
  const showRight = handsMode !== "leftOnly";

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
  const isCompleted = lesson?.isCompleted ?? false;
  const statsLine = (() => {
    if (timingStats.total === 0) return null;
    if (timingStats.total < 5 && !isCompleted) return null;
    const pct = (n: number) => `${Math.round(n / timingStats.total * 100)}%`;
    const parts: string[] = [];
    if (timingStats.early  > 0) parts.push(`Early ${pct(timingStats.early)}`);
    parts.push(`On time ${pct(timingStats.onTime)}`);
    if (timingStats.late   > 0) parts.push(`Late ${pct(timingStats.late)}`);
    return parts.join(" · ");
  })();

  // Shown in the feedback line when the lesson is complete.
  const completionFeedback = lesson?.isCompleted ? (() => {
    const mistakes = Object.values(snapshot?.mistakesByStep ?? {}).reduce((a, b) => a + b, 0);
    const skips = lesson.alreadySatisfiedCount ?? 0;
    const totalSteps = lesson.totalSteps;
    const accuracy = Math.round(totalSteps / (totalSteps + mistakes + skips) * 100);
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
      return rh != null && lh != null ? `${noteName(rh)}+${noteName(lh)}` : null;
    })() : null;
    const parts = [
      timeStr && `${timeStr}`,
      `${accuracy}% accuracy`,
      `${mistakes} mistake${mistakes === 1 ? "" : "s"}`,
      syncMs  != null ? `sync avg ±${Math.round(syncMs)}ms` : null,
      minSync != null ? `best ${Math.round(minSync)}ms` : null,
      maxSync != null ? `worst ${Math.round(maxSync)}ms${worstNote ? ` (${worstNote})` : ""}` : null,
      lesson.velocityCV != null ? `evenness ${(100 - Math.min(lesson.velocityCV, 100)).toFixed(0)}%` : null,
    ].filter(Boolean).join(" \u00b7 ");
    return `✓ Complete${parts ? ` — ${parts}` : ""}${loopMode ? " · next run starting…" : " · press Reset to begin again"}`;
  })() : null;

  return (
    <main className="practice">
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
        />
      </section>

      <section className="practice__feedback">
        <p style={feedbackColor ? { color: feedbackColor } : undefined}>
          {completionFeedback ?? feedbackWithTiming}
        </p>
        {statsLine && <p className="practice__timing-stats">{statsLine}</p>}
      </section>
    </main>
  );
}
