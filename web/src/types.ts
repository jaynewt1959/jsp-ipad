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
  /** Step index the score overlay should highlight. Advances on legatoPrepress
   *  as well as advancement, so the green dot tracks the physically-pressed note. */
  displayStepIndex: number;
  /** Count of alreadySatisfied events for the active hand since last rewind.
   *  Non-zero means the user re-pressed notes while still holding them (too legato).
   *  Zero mistakes AND zero skips = 100% accuracy. */
  alreadySatisfiedCount: number;
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
