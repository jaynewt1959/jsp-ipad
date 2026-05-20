// Convert a MIDI note number (0..127) into a human-readable name.
// useFlats=true -> flat spellings (B\u266d, E\u266d etc); default = sharps.
// Octave: scientific convention, MIDI 60 = C4.

const SHARP_NAMES = [
  "C", "C\u266F", "D", "D\u266F", "E", "F",
  "F\u266F", "G", "G\u266F", "A", "A\u266F", "B"
] as const;

const FLAT_NAMES = [
  "C", "D\u266D", "D", "E\u266D", "E", "F",
  "G\u266D", "G", "A\u266D", "A", "B\u266D", "B"
] as const;

/** Keys that spell accidentals as flats. */
export const FLAT_KEY_SIGNATURES = new Set([
  "fMajor", "bbMajor", "ebMajor", "abMajor",
  "dNaturalMinor", "gNaturalMinor", "cNaturalMinor",
  "fNaturalMinor", "bbNaturalMinor", "ebNaturalMinor", "abNaturalMinor",
]);

export function noteName(midi: number, useFlats = false): string {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  const pitch = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pitch}${octave}`;
}
