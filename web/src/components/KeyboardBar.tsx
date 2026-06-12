// KeyboardBar — compact device/range strip shown under the feedback area.
//
// Three states:
//   • calibrating — step prompts (lowest key → highest key) + Skip / Cancel
//   • idle        — active device name, detected range, Recalibrate button,
//                   and a source picker when several MIDI sources are present
//   • hidden      — when MIDI is not running
import type { Command, Snapshot } from "../types";
import { noteName } from "../util/noteName";

interface Props {
  snapshot: Snapshot | null;
  send: (cmd: Command) => void;
}

export function KeyboardBar({ snapshot, send }: Props) {
  const midi = snapshot?.midi;
  const kb = snapshot?.keyboard;
  if (!midi?.running || !kb) return null;

  if (kb.calibration !== "idle") {
    return (
      <div className="keyboard-bar" role="status" aria-live="polite">
        <span className="keyboard-bar__prompt">
          {kb.calibration === "awaitingLow"
            ? "Calibrate: press the LOWEST key on your keyboard"
            : "Now press the HIGHEST key"}
        </span>
        <button className="btn btn--bar" onClick={() => send({ type: "skipCalibration" })}>
          Skip — full range
        </button>
        <button className="btn btn--bar" onClick={() => send({ type: "cancelCalibration" })}>
          Cancel
        </button>
      </div>
    );
  }

  const rangeLabel = kb.rangeLow != null && kb.rangeHigh != null
    ? `${noteName(kb.rangeLow)}–${noteName(kb.rangeHigh)} · ${kb.rangeHigh - kb.rangeLow + 1} keys`
    : "full range";

  return (
    <div className="keyboard-bar">
      <span className="keyboard-bar__device">
        🎹 {midi.activeSource ?? "No keyboard detected"}
      </span>
      <span className="keyboard-bar__range">{rangeLabel}</span>
      {midi.sources.length > 1 && midi.sources.map(s => (
        <button
          key={s}
          className={`btn btn--bar ${s === midi.activeSource ? "btn--bar-active" : ""}`}
          onClick={() => send({ type: "setActiveSource", sourceName: s })}
        >
          {s}
        </button>
      ))}
      {midi.activeSource != null && (
        <button className="btn btn--bar" onClick={() => send({ type: "startCalibration" })}>
          Recalibrate
        </button>
      )}
    </div>
  );
}
