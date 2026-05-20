// Score model that the VexFlow-backed `ScoreView` renders.
//
// Important: this is a *parallel* description of the lesson tuned for
// rendering, not a copy of the engine's truth. The engine's
// `Sources/Lesson/CMajor.swift` defines what the user must play; this
// file adds the musical metadata needed to typeset it (durations,
// time/key signature, bar layout). If the engine's lesson data ever
// changes, the corresponding constants here must change in lockstep.
//
// For v0 there is exactly one lesson — C major hands-together two
// octaves ascending — so the model is hard-coded. When the engine
// gains a second lesson we'll generalise this module.

import { midiToVexFlowKey } from "./midiToPitch";

export interface NoteSpec {
  /** MIDI note number, used for highlights / error attribution. */
  midi: number;
  /** VexFlow pitch key, e.g. "c/4". */
  pitch: string;
  /** VexFlow duration code: "q" = quarter, "h" = half. */
  duration: string;
  /** Finger 1-5 prompted at this step, or null. */
  fingering: number | null;
  /** Index into the lesson's step list. Same on both staves. */
  stepIndex: number;
  /**
   * Which staff this note is *visually* drawn on. For LH notes this
   * is the bass clef in the low register and the treble clef once
   * the line crosses middle C, matching standard piano-score
   * convention so the user isn't reading a stack of ledger lines.
   * RH always renders on the treble.
   */
  displayStaff: "treble" | "bass";
}

export interface ScoreModel {
  /** Right-hand notes, one per step (treble staff). */
  rh: NoteSpec[];
  /** Left-hand notes, one per step (bass staff). */
  lh: NoteSpec[];
  /**
   * Number of notes per measure, in order. The sum equals
   * `rh.length` (== `lh.length`). Beat-counts must match the time
   * signature; e.g. for 4/4 a measure totalling 4 beats can be
   * "q q q q" or "q q h" etc.
   */
  measures: number[];
  keySig: "C";
  timeSig: "4/4";
}

// MARK: - C major two-octave hands-together ascending + descending
//
// Mirrors Sources/Lesson/CMajor.swift exactly. 29 notes per hand:
//   15 ascending  (C3/C4 → C5/C6)
//   14 descending (B4/B5 → C3/C4, turnaround notes not repeated)
//
// Layout: common time (4/4), eighth notes throughout, last note
// is a half note to fill bar 4.
//   Bar 1: steps  0-7  (8 × ♪ = 4 beats)
//   Bar 2: steps  8-15 (8 × ♪ = 4 beats)
//   Bar 3: steps 16-23 (8 × ♪ = 4 beats)
//   Bar 4: steps 24-27 + step 28 (4 × ♪ + 𝅗𝅥 = 2+2 = 4 beats)

// Ascending leg (15 notes each hand)
const LH_MIDI_ASC = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
const RH_MIDI_ASC = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
const LH_FING_ASC = [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1];
const RH_FING_ASC = [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5];

// Descending leg (14 notes each hand — turnaround note omitted)
const LH_MIDI_DESC = [71, 69, 67, 65, 64, 62, 60, 59, 57, 55, 53, 52, 50, 48];
const RH_MIDI_DESC = [83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60];
const LH_FING_DESC = [2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5];
const RH_FING_DESC = [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1];

const LH_MIDI_FULL = [...LH_MIDI_ASC, ...LH_MIDI_DESC];
const RH_MIDI_FULL = [...RH_MIDI_ASC, ...RH_MIDI_DESC];
const LH_FING_FULL = [...LH_FING_ASC, ...LH_FING_DESC];
const RH_FING_FULL = [...RH_FING_ASC, ...RH_FING_DESC];

/// LH notes at MIDI >= 60 (C4) migrate to the treble staff with
/// stems pointing down. RH always renders on the treble.
function assignDisplayStaff(
  midi: number,
  hand: "left" | "right"
): "treble" | "bass" {
  if (hand === "right") return "treble";
  return midi >= 60 ? "treble" : "bass";
}

/// Build a NoteSpec array from parallel midi / finger arrays.
/// `normalDuration` defaults to "q" (quarter); pass "8" for eighth notes.
function makeNotes(
  midis: number[],
  fingers: number[],
  hand: "left" | "right",
  normalDuration: string = "q"
): NoteSpec[] {
  const last = midis.length - 1;
  return midis.map((midi, i) => ({
    midi,
    pitch: midiToVexFlowKey(midi),
    duration: i === last ? "h" : normalDuration,
    fingering: fingers[i],
    stepIndex: i,
    displayStaff: assignDisplayStaff(midi, hand)
  }));
}

/// C major two-octave ascending + descending, hands together.
/// 29 steps, eighth notes, 4 bars of common time.
export const C_MAJOR_TWO_OCTAVES_HANDS_TOGETHER: ScoreModel = {
  rh: makeNotes(RH_MIDI_FULL, RH_FING_FULL, "right", "8"),
  lh: makeNotes(LH_MIDI_FULL, LH_FING_FULL, "left",  "8"),
  // Bars 1-3: 8 eighth notes (4 beats). Bar 4: 4 eighth + 1 half (4 beats).
  measures: [8, 8, 8, 5],
  keySig: "C",
  timeSig: "4/4"
};

/// Resolve which `ScoreModel` to render given the lesson info from a
/// snapshot. Returns null if we don't have a model for this lesson
/// shape yet.
export function buildScoreModel(
  lesson: {
    key: string;
    direction: string;
    handsMode: string;
    totalSteps: number;
  } | null | undefined
): ScoreModel | null {
  if (!lesson) return null;
  if (
    lesson.key === "cMajor" &&
    lesson.direction === "ascendingDescending" &&
    lesson.handsMode === "together" &&
    lesson.totalSteps === C_MAJOR_TWO_OCTAVES_HANDS_TOGETHER.rh.length
  ) {
    return C_MAJOR_TWO_OCTAVES_HANDS_TOGETHER;
  }
  return null;
}
