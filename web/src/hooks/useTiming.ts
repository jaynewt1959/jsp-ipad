// useTiming — evaluates the most recent note's timing against the
// eighth-note beat grid.
//
// Architecture (see plan):
//   • The server captures lastNoteOnMs (Unix-epoch ms) when a correct
//     note arrives and includes it in every snapshot.
//   • The server also sends lessonStartMs as the beat-grid anchor.
//   • Clock skew between Mac and iPad is estimated from serverTimeMs.
//   • Timing evaluation happens here on the client so audio output
//     latency is naturally cancelled out — the metronome audio and
//     the lastNoteOnMs reference share the same (server) clock.
//
// Eighth-note grid:
//   eighthPeriodMs = 30 000 / bpm
//   Grid points: lessonStartMs, lessonStartMs + eighthPeriodMs, …
//   deviation = distance to nearest grid point (signed: – = early, + = late)

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

export type TimingQuality = "onTime" | "slightly" | "clearly";

export interface TimingResult {
  /** Signed deviation in ms (negative = early, positive = late). */
  deviationMs: number;
  quality: TimingQuality;
  /** Human-readable label, e.g. "on time", "45 ms early", "120 ms late". */
  label: string;
  /** Lesson step index that was being evaluated. */
  stepIndex: number;
  /** The lastNoteOnMs value used — doubles as a stable identity key. */
  noteMs: number;
}

export interface TimingStats {
  early:  number;
  late:   number;
  onTime: number;
  total:  number;
}

/** Thresholds as fractions of one eighth-note period. */
const ON_TIME_FRAC   = 0.15;
const SLIGHTLY_FRAC  = 0.35;

function evaluate(
  deviationMs: number,
  eighthMs: number,
  stepIndex: number,
  noteMs: number,
): TimingResult {
  const abs  = Math.abs(deviationMs);
  const frac = abs / eighthMs;
  const quality: TimingQuality =
    frac < ON_TIME_FRAC  ? "onTime"   :
    frac < SLIGHTLY_FRAC ? "slightly" : "clearly";

  const label =
    quality === "onTime"
      ? "on time"
      : `${Math.round(abs)} ms ${deviationMs < 0 ? "early" : "late"}`;

  return { deviationMs, quality, label, stepIndex, noteMs };
}

interface TimingHook {
  /** null when metronome is off or no note has been played yet. */
  timing: TimingResult | null;
  /** Cumulative counts for the current lesson run. */
  stats: TimingStats;
}

const EMPTY_STATS: TimingStats = { early: 0, late: 0, onTime: 0, total: 0 };

export function useTiming(snapshot: Snapshot | null): TimingHook {
  const [timing, setTiming] = useState<TimingResult | null>(null);
  const [stats, setStats]   = useState<TimingStats>(EMPTY_STATS);

  const clockSkewRef      = useRef(0);
  const lastEvaluatedRef  = useRef<number | null>(null);
  // Track lesson start to detect rewinds and reset stats.
  const lastLessonStartMs = useRef<number>(0);

  useEffect(() => {
    if (!snapshot) return;

    clockSkewRef.current = snapshot.serverTimeMs - Date.now();

    const { metronome, lesson } = snapshot;

    // Reset everything on a new lesson run.
    if (lesson.lessonStartMs !== lastLessonStartMs.current) {
      lastLessonStartMs.current = lesson.lessonStartMs;
      lastEvaluatedRef.current  = null;
      setTiming(null);
      setStats(EMPTY_STATS);
    }

    if (!metronome.enabled) {
      setTiming(null);
      lastEvaluatedRef.current = null;
      return;
    }

    const { lastNoteOnMs, lessonStartMs, currentStepIndex } = lesson;
    if (lastNoteOnMs == null) return;
    if (lastNoteOnMs === lastEvaluatedRef.current) return;
    lastEvaluatedRef.current = lastNoteOnMs;

    const eighthMs = 30_000 / metronome.bpm;
    // Both lastNoteOnMs and lessonStartMs are set by the server (Mac clock),
    // so their difference is already correct — no clock-skew adjustment needed.
    const elapsedMs = lastNoteOnMs - lessonStartMs;
    const remainder = ((elapsedMs % eighthMs) + eighthMs) % eighthMs;
    const deviation = remainder > eighthMs / 2 ? remainder - eighthMs : remainder;

    const result = evaluate(deviation, eighthMs, currentStepIndex, lastNoteOnMs);
    setTiming(result);
    setStats(prev => ({
      ...prev,
      total:  prev.total  + 1,
      onTime: prev.onTime + (result.quality === "onTime" ? 1 : 0),
      early:  prev.early  + (result.quality !== "onTime" && result.deviationMs < 0 ? 1 : 0),
      late:   prev.late   + (result.quality !== "onTime" && result.deviationMs > 0 ? 1 : 0),
    }));
  }, [snapshot]);

  return { timing, stats };
}
