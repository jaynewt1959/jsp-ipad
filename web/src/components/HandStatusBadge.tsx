import type { HandStatus } from "../types";
import { noteName } from "../util/noteName";
import { FingerPrompt } from "./FingerPrompt";

interface Props {
  hand: "left" | "right";
  status: HandStatus;
  expectedNote: number | null;
  expectedFinger: number | null;
  useFlats?: boolean;
}

const HAND_LABEL: Record<Props["hand"], string> = {
  left: "Left hand",
  right: "Right hand"
};

const STATUS_TONE: Record<HandStatus["kind"], string> = {
  idle: "idle",
  waitingForPartner: "waiting",
  correct: "correct",
  wrong: "wrong"
};

const STATUS_FOOTNOTE: Record<HandStatus["kind"], string> = {
  idle: "Waiting for input",
  waitingForPartner: "Hold — waiting for the other hand",
  correct: "Correct",
  wrong: "" // overridden below to include the played note
};

const STATUS_GLYPH: Record<HandStatus["kind"], string> = {
  idle: "○",
  waitingForPartner: "⏳",
  correct: "✓",
  wrong: "✗"
};

export function HandStatusBadge({ hand, status, expectedNote, expectedFinger, useFlats = false }: Props) {
  const tone = STATUS_TONE[status.kind];
  const footnote =
    status.kind === "wrong"
      ? `You played ${noteName(status.played, useFlats)}`
      : STATUS_FOOTNOTE[status.kind];

  return (
    <div className={`hand-badge hand-badge--${tone}`} role="group" aria-label={HAND_LABEL[hand]}>
      <header className="hand-badge__header">
        <span className="hand-badge__name">{HAND_LABEL[hand]}</span>
        <span className="hand-badge__glyph" aria-hidden>{STATUS_GLYPH[status.kind]}</span>
      </header>
      <div className="hand-badge__body">
        <FingerPrompt finger={expectedFinger} />
        <div className="hand-badge__note">
          <div className="hand-badge__note-label">Note</div>
          <div className="hand-badge__note-value">
            {expectedNote == null ? "—" : noteName(expectedNote, useFlats)}
          </div>
        </div>
      </div>
      <footer className="hand-badge__footnote">{footnote || "\u00A0"}</footer>
    </div>
  );
}
