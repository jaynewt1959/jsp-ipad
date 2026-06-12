import type { MidiState } from "../types";

/** True when on-screen key taps should drive the lesson: no physical
 *  MIDI keyboard is actively connected (covers both "MIDI never
 *  started" and "started with zero sources"). Mirrors the server-side
 *  guard in `SessionCoordinator.handleSimulateNote`. */
export function tapsEnabled(midi: MidiState | null | undefined): boolean {
  return !(midi?.running && midi.activeSource != null);
}
