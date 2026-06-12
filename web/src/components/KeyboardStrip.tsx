import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { noteName } from "../util/noteName";

interface Props {
  lowestMidi: number;
  highestMidi: number;
  highlightLeft: number | null;
  highlightRight: number | null;
  fingerLeft: number | null;
  fingerRight: number | null;
  /** True when the on-screen keys accept taps (no physical keyboard active). */
  tappable: boolean;
  /** Tap handler. isOn: true on press, false on release. */
  onKey: (midi: number, isOn: boolean) => void;
}

const BLACK_KEY_OFFSETS = new Set<number>([1, 3, 6, 8, 10]);
const isBlack = (midi: number) => BLACK_KEY_OFFSETS.has(((midi % 12) + 12) % 12);

type Highlight = "none" | "left" | "right" | "both";

function highlightFor(
  midi: number,
  left: number | null,
  right: number | null
): Highlight {
  const isLeft = left != null && left === midi;
  const isRight = right != null && right === midi;
  if (isLeft && isRight) return "both";
  if (isLeft) return "left";
  if (isRight) return "right";
  return "none";
}

/** Returns the finger number and hand side to display on a highlighted key. */
function fingerFor(
  hl: Highlight,
  fingerLeft: number | null,
  fingerRight: number | null,
): { num: number | null; side: "left" | "right" | null } {
  if (hl === "left")  return { num: fingerLeft,  side: "left" };
  if (hl === "right") return { num: fingerRight, side: "right" };
  if (hl === "both")  return { num: fingerLeft,  side: "left" }; // LH priority on shared note
  return { num: null, side: null };
}

/// Horizontal piano keyboard rendered as a flexbox row of white keys
/// with absolutely-positioned black keys layered on top. Highlights
/// the two expected MIDI notes (LH = blue, RH = orange, both = purple).
/// When `tappable`, the keys double as demo-mode input: presses and
/// releases are reported via `onKey` (wired to the `simulateNote`
/// command), so the whole lesson works without a physical keyboard.
export function KeyboardStrip({
  lowestMidi,
  highestMidi,
  highlightLeft,
  highlightRight,
  fingerLeft,
  fingerRight,
  tappable,
  onKey,
}: Props) {
  const whiteKeys: number[] = [];
  for (let m = lowestMidi; m <= highestMidi; m++) {
    if (!isBlack(m)) whiteKeys.push(m);
  }

  // Keys currently held by a pointer — drives the pressed visual and
  // pairs note-offs with note-ons.
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());

  const press = (midi: number) => {
    if (!tappable || pressed.has(midi)) return;
    const next = new Set(pressed);
    next.add(midi);
    setPressed(next);
    onKey(midi, true);
  };

  // Not gated on `tappable`, so no key sticks if a physical keyboard
  // becomes active mid-press.
  const release = (midi: number) => {
    if (!pressed.has(midi)) return;
    const next = new Set(pressed);
    next.delete(midi);
    setPressed(next);
    onKey(midi, false);
  };

  const tapHandlers = (midi: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      press(midi);
    },
    onPointerUp: () => release(midi),
    onPointerLeave: () => release(midi),
    onPointerCancel: () => release(midi),
  });

  return (
    <div className={`keyboard-strip${tappable ? " keyboard-strip--tappable" : ""}`}>
      <div className="keyboard-strip__whites">
        {whiteKeys.map((midi) => {
          const hl = highlightFor(midi, highlightLeft, highlightRight);
          const isC = midi % 12 === 0;
          const { num: fingerNum, side: fingerSide } = fingerFor(hl, fingerLeft, fingerRight);
          return (
            <div
              key={midi}
              className={`keyboard-strip__white keyboard-strip__white--hl-${hl}${pressed.has(midi) ? " keyboard-strip__white--pressed" : ""}`}
              title={noteName(midi)}
              {...tapHandlers(midi)}
            >
              {fingerNum != null && fingerSide && (
                <span className={`keyboard-strip__finger keyboard-strip__finger--${fingerSide}`}>
                  {fingerNum}
                </span>
              )}
              {isC && <span className="keyboard-strip__c-label">{noteName(midi)}</span>}
            </div>
          );
        })}
      </div>
      <div className="keyboard-strip__blacks">
        {whiteKeys.map((midi, idx) => {
          const blackMidi = midi + 1;
          // Only place a black key if (a) the next semitone above is
          // a black key and (b) we still have a right-neighbour white
          // key to anchor against (skip the very last white).
          if (!isBlack(blackMidi) || idx === whiteKeys.length - 1) return null;
          const hl = highlightFor(blackMidi, highlightLeft, highlightRight);
          const { num: fingerNum, side: fingerSide } = fingerFor(hl, fingerLeft, fingerRight);
          // Position: between this white and the next, so left = (idx+1)/N.
          const leftPct = ((idx + 1) / whiteKeys.length) * 100;
          return (
            <div
              key={blackMidi}
              className={`keyboard-strip__black keyboard-strip__black--hl-${hl}${pressed.has(blackMidi) ? " keyboard-strip__black--pressed" : ""}`}
              style={{ left: `${leftPct}%` }}
              title={noteName(blackMidi)}
              {...tapHandlers(blackMidi)}
            >
              {fingerNum != null && fingerSide && (
                <span className={`keyboard-strip__finger keyboard-strip__finger--${fingerSide}`}>
                  {fingerNum}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
