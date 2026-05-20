// MIDI note number -> VexFlow pitch key like "c/4".
//
// For C major (the only key in v0) all pitch classes are naturals, so
// we never need to emit accidentals. The full chromatic table is
// included so adding sharp keys later is a single-line change.

const PITCH_CLASS = [
  "c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"
] as const;

export function midiToVexFlowKey(midi: number): string {
  const pc = PITCH_CLASS[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pc}/${octave}`;
}
