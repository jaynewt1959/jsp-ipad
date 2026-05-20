interface Props {
  finger: number | null;
}

/// Big-circle digit prompting the user which finger to use.
/// Renders an em-dash when the hand has no expected finger at the
/// current step.
export function FingerPrompt({ finger }: Props) {
  return (
    <div className="finger-prompt">
      <div className="finger-prompt__label">Finger</div>
      <div className="finger-prompt__circle">
        <span>{finger == null ? "—" : finger}</span>
      </div>
    </div>
  );
}
