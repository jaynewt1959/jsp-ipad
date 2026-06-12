// availability.ts — which scale keys physically fit the connected keyboard.
//
// All 48 lessons are two octaves with identical roots per key label, so
// availability depends only on the device range and the hand mode:
//   leftOnly  -> LH span (lhRoot .. lhRoot+24)
//   rightOnly -> RH span (rhRoot .. rhRoot+24)
//   together  -> LH low .. RH high (lhRoot .. lhRoot+36)
// A null range means the keyboard is unknown / full-size: everything fits.

import { KEY_SPECS, getScaleDescriptor, type KeySpec } from "../data/scales";
import type { HandMode, KeyboardState } from "../types";

export interface KeyRange {
  low: number;
  high: number;
}

/** The active device range, or null when unknown / full-size. */
export function rangeFromKeyboard(kb: KeyboardState | null | undefined): KeyRange | null {
  if (!kb || kb.rangeLow == null || kb.rangeHigh == null) return null;
  return { low: kb.rangeLow, high: kb.rangeHigh };
}

/** Span of the lesson for a key spec in the given hand mode. */
function spanFor(spec: KeySpec, handMode: HandMode): KeyRange {
  // The major descriptor suffices: all four scale types share the same
  // roots and two-octave span per key label.
  const d = getScaleDescriptor(spec.majorKey);
  const notes =
    handMode === "leftOnly"  ? d.lhMidi :
    handMode === "rightOnly" ? d.rhMidi :
    [...d.lhMidi, ...d.rhMidi];
  return { low: Math.min(...notes), high: Math.max(...notes) };
}

/** True when the key's lesson fits the range in the given hand mode. */
export function keyAvailable(spec: KeySpec, handMode: HandMode, range: KeyRange | null): boolean {
  if (!range) return true;
  const span = spanFor(spec, handMode);
  return span.low >= range.low && span.high <= range.high;
}

/** Labels of KEY_SPECS rows playable in the given hand mode. */
export function availableKeyLabels(handMode: HandMode, range: KeyRange | null): Set<string> {
  return new Set(
    KEY_SPECS.filter(s => keyAvailable(s, handMode, range)).map(s => s.label),
  );
}

/** True when at least one key is playable in the given hand mode. */
export function modeHasAnyKey(handMode: HandMode, range: KeyRange | null): boolean {
  if (!range) return true;
  return KEY_SPECS.some(s => keyAvailable(s, handMode, range));
}

/** True when every key is playable in the given hand mode (Cycle requires this). */
export function allKeysAvailable(handMode: HandMode, range: KeyRange | null): boolean {
  if (!range) return true;
  return KEY_SPECS.every(s => keyAvailable(s, handMode, range));
}
