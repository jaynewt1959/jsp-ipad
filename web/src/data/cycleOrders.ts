// cycleOrders.ts — builds ordered pools of scale keys for cyclic practice.
//
// Uses KEY_SPECS from scales.ts as the canonical root list.

import { KEY_SPECS, minorKeyFor, type MinorVariant } from "./scales";

export type CycleOrder     = "random" | "chromatic" | "fifths";
export type CycleScaleType = "major" | "minor" | "both";

// ---------------------------------------------------------------------------
// Root orderings (by KEY_SPECS label)
// ---------------------------------------------------------------------------

const CHROMATIC_LABELS = KEY_SPECS.map(s => s.label);
// C G D A E B F♯ C♯ A♭ E♭ B♭ F
const FIFTHS_LABELS = ["C","G","D","A","E","B","F\u266F","C\u266F","A\u266D","E\u266D","B\u266D","F"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rotate `arr` so that the element at `startIndex` comes first. */
function rotate<T>(arr: T[], startIndex: number): T[] {
  if (startIndex <= 0) return arr;
  const i = startIndex % arr.length;
  return [...arr.slice(i), ...arr.slice(0, i)];
}

/**
 * Fisher-Yates shuffle (returns new array).
 * If `avoidFirst` is provided and equals the first element after
 * shuffling, swap it with a random later position so the caller
 * never sees the same value twice in a row across pool boundaries.
 */
function shuffle<T>(arr: T[], avoidFirst?: T): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (avoidFirst !== undefined && a.length > 1 && a[0] === avoidFirst) {
    const swap = 1 + Math.floor(Math.random() * (a.length - 1));
    [a[0], a[swap]] = [a[swap], a[0]];
  }
  return a;
}

/** Find the KEY_SPECS index whose major or any minor key matches `scaleKey`. */
function rootIndexForKey(scaleKey: string): number {
  const idx = KEY_SPECS.findIndex(
    s => s.majorKey === scaleKey || s.naturalMinorKey === scaleKey ||
         s.harmonicMinorKey === scaleKey || s.melodicMinorKey === scaleKey
  );
  return idx >= 0 ? idx : 0;
}

/** Map a KEY_SPECS label to its index in KEY_SPECS. */
const labelToSpecIndex = new Map<string, number>(KEY_SPECS.map((s, i) => [s.label, i]));

/**
 * Given an ordering of labels, return KEY_SPECS indices in that order,
 * rotated so the root matching `startKey` comes first.
 */
function orderedSpecIndices(labels: readonly string[], startKey: string): number[] {
  const specIdx = rootIndexForKey(startKey);
  const startLabel = KEY_SPECS[specIdx].label;
  const labelIdx = labels.indexOf(startLabel);
  const rotated = rotate([...labels], labelIdx >= 0 ? labelIdx : 0);
  return rotated.map(l => labelToSpecIndex.get(l) ?? 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an ordered array of scale key strings for cyclic practice.
 *
 * @param scaleType  Which scales to include.
 * @param order      How to order them.
 * @param startKey   The scale key to start from (e.g. "dMajor").
 *                   For chromatic/fifths the pool is rotated so this key's
 *                   root comes first.  For random, the pool is shuffled.
 */
export function buildCyclePool(
  scaleType: CycleScaleType,
  order: CycleOrder,
  startKey: string,
  /** Last key played — used to avoid duplicates at random pool boundaries. */
  avoidKey?: string,
  /** Which minor sub-type "minor"/"both" resolves to. */
  minorVariant: MinorVariant = "natural",
): string[] {
  if (order === "random") {
    return shuffle(collectKeys(scaleType, minorVariant), avoidKey);
  }

  const labels = order === "fifths" ? FIFTHS_LABELS : CHROMATIC_LABELS;
  const indices = orderedSpecIndices(labels, startKey);

  const keys: string[] = [];
  for (const i of indices) {
    const spec = KEY_SPECS[i];
    if (scaleType === "major" || scaleType === "both") keys.push(spec.majorKey);
    if (scaleType === "minor" || scaleType === "both") keys.push(minorKeyFor(spec, minorVariant));
  }
  return keys;
}

/** Flat list of all keys for the given scale type (unordered). */
function collectKeys(scaleType: CycleScaleType, minorVariant: MinorVariant): string[] {
  const keys: string[] = [];
  for (const spec of KEY_SPECS) {
    if (scaleType === "major" || scaleType === "both") keys.push(spec.majorKey);
    if (scaleType === "minor" || scaleType === "both") keys.push(minorKeyFor(spec, minorVariant));
  }
  return keys;
}
