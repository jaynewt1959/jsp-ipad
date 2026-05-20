import { noteName } from "../util/noteName";

interface Props {
  lowestMidi: number;
  highestMidi: number;
  highlightLeft: number | null;
  highlightRight: number | null;
  fingerLeft: number | null;
  fingerRight: number | null;
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
export function KeyboardStrip({
  lowestMidi,
  highestMidi,
  highlightLeft,
  highlightRight,
  fingerLeft,
  fingerRight,
}: Props) {
  const whiteKeys: number[] = [];
  for (let m = lowestMidi; m <= highestMidi; m++) {
    if (!isBlack(m)) whiteKeys.push(m);
  }

  return (
    <div className="keyboard-strip" role="presentation">
      <div className="keyboard-strip__whites">
        {whiteKeys.map((midi) => {
          const hl = highlightFor(midi, highlightLeft, highlightRight);
          const isC = midi % 12 === 0;
          const { num: fingerNum, side: fingerSide } = fingerFor(hl, fingerLeft, fingerRight);
          return (
            <div
              key={midi}
              className={`keyboard-strip__white keyboard-strip__white--hl-${hl}`}
              title={noteName(midi)}
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
              className={`keyboard-strip__black keyboard-strip__black--hl-${hl}`}
              style={{ left: `${leftPct}%` }}
              title={noteName(blackMidi)}
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
