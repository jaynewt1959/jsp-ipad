// Wire-format TypeScript types for the JSP engine.
//
// MUST be kept in sync with `Sources/Server/Wire.swift`. Any change
// here implies a change there (and vice versa). The contract is also
// documented in `docs/protocol.md` (added in phase 6).

export type HandStatus =
  | { kind: "idle" }
  | { kind: "waitingForPartner" }
  | { kind: "correct" }
  | { kind: "wrong"; played: number };

export interface ScaleStep {
  leftNote: number | null;
  leftFinger: number | null;
  rightNote: number | null;
  rightFinger: number | null;
}

export interface MidiState {
  running: boolean;
  sources: string[];
  /** Display name of the source whose events drive the lesson, or null when
   *  no source is connected. iPad-only field (not in Mac jsp). */
  activeSource: string | null;
}

export type CalibrationPhase = "idle" | "awaitingLow" | "awaitingHigh";

/** Detected physical key range and calibration status of the active keyboard.
 *  iPad-only (not in Mac jsp). null range = unknown / full-size. */
export interface KeyboardState {
  rangeLow: number | null;
  rangeHigh: number | null;
  calibration: CalibrationPhase;
}

export interface LessonState {
  key: string;
  direction: string;
  handsMode: string;
  totalSteps: number;
  currentStepIndex: number;
  isCompleted: boolean;
  currentStep: ScaleStep | null;
  /** Unix-epoch ms when the current lesson run started. */
  lessonStartMs: number;
  /** Unix-epoch ms when the most recent correct note-on arrived. null until first note. */
  lastNoteOnMs: number | null;
  /** Step index the score overlay should highlight. */
  displayStepIndex: number;
  /** Count of stale-note precision demerits since the last rewind.
   *  Incremented when a hand presses step N while still holding the note
   *  from step N-2. One-step overlap is valid legato; two-step overlap
   *  counts as imprecise technique. Zero mistakes AND zero staleness = 100% precision. */
  stalenessCount: number;
  /** Average ms between first and second hand arriving on the same step.
   * Only set in together mode; null until at least one step completes. */
  avgSyncMs: number | null;
  /** Best (smallest) sync gap so far. */
  minSyncMs: number | null;
  /** Worst (largest) sync gap so far. */
  maxSyncMs: number | null;
  /** Step index (0-based) at which the worst sync gap occurred. */
  worstSyncStep: number | null;
  /** Stddev/mean × 100 of correct-note velocities. Lower = more even. null until ≥2 notes. */
  velocityCV: number | null;
  /** Stddev/mean × 100 of inter-onset intervals. Lower = more rhythmically even. null until ≥3 notes. */
  rhythmCV: number | null;
  /** True when every note-on this run carried an identical velocity (≥8 samples) —
   *  the keyboard is not touch-sensitive, so velocityCV is suppressed (null) and
   *  evenness is excluded from the composite score. iPad-only field (not in Mac jsp). */
  fixedVelocity: boolean;
}

export interface MetronomeState {
  enabled: boolean;
  bpm: number;
}

export interface Snapshot {
  type: "snapshot";
  midi: MidiState;
  lesson: LessonState;
  handStatus: { left: HandStatus; right: HandStatus };
  feedback: string;
  mistakesByStep: Record<string, number>;
  elapsedSec: number | null;
  serverTimeMs: number;
  metronome: MetronomeState;
  keyboard: KeyboardState;
}

export type HandMode = "together" | "leftOnly" | "rightOnly";

export type Command =
  | { type: "startLesson" }
  | { type: "restartLesson"; clearHistory?: boolean }
  | { type: "stopMidi" }
  | { type: "requestDebugLog" }
  | { type: "setHandMode"; handMode: HandMode }
  | { type: "setMetronome"; metronomeEnabled: boolean; metronomeBpm: number }
  | { type: "setScale"; scaleKey: string }
  | { type: "setDirection"; direction: "ascending" | "descending" | "ascendingDescending" }
  | { type: "setActiveSource"; sourceName: string }
  | { type: "startCalibration" }
  | { type: "cancelCalibration" }
  | { type: "skipCalibration" }
  /** On-screen keyboard tap (demo mode). iPad-only command (not in Mac jsp).
   *  Only honored server-side when no physical keyboard is active. */
  | { type: "simulateNote"; note: number; isOn: boolean }
  | { type: "ping" };

// ---------------------------------------------------------------------------
// Diagnostic event log  (server → client, on demand)
// ---------------------------------------------------------------------------

/// One timestamped MIDI event with its engine interpretation.
export interface LogEntry {
  /** Milliseconds since lesson start. */
  ms: number;
  /** MIDI note number 0-127. */
  note: number;
  /** Note velocity 0-127. */
  velocity: number;
  /** true = note-on; false = note-off. */
  isOn: boolean;
  /** Step index when this event arrived. */
  stepIndex: number;
  /** Colon-delimited result tokens, e.g. ["correct:left:0", "advanced:1"].
   *  Empty for stray note-offs. ["restart"] for the C3+C4 gesture. */
  results: string[];
  /** true when this event triggered an automatic lesson rewind. */
  triggeredRestart: boolean;
}

export interface DebugLogMessage {
  type: "debugLog";
  entries: LogEntry[];
}
