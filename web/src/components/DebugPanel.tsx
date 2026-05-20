import type { DebugLogMessage, LogEntry } from "../types";

interface Props {
  log: DebugLogMessage;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Note name helper
// ---------------------------------------------------------------------------

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

// ---------------------------------------------------------------------------
// Result token parsing
// ---------------------------------------------------------------------------

interface ParsedResult {
  label: string;
  cls: string;
  isAhead: boolean;  // alreadySatisfied — the key sync-bug indicator
}

function parseResult(r: string): ParsedResult {
  if (r === "restart") {
    return { label: "↺ restart", cls: "tag--restart", isAhead: false };
  }
  if (r === "lessonNotStarted") {
    return { label: "not started", cls: "tag--muted", isAhead: false };
  }
  const p = r.split(":");
  switch (p[0]) {
    case "correct":
      return { label: `✓ ${p[1]}`, cls: "tag--correct", isAhead: false };
    case "released":
      return { label: `↑ ${p[1]}`, cls: "tag--released", isAhead: false };
    case "wrong": {
      // format: wrong:hand:step:expected:played
      const exp = p[3] != null ? noteName(parseInt(p[3])) : "?";
      const got = p[4] != null ? noteName(parseInt(p[4])) : "?";
      return { label: `✗ ${p[1]}: ${got} (exp ${exp})`, cls: "tag--wrong", isAhead: false };
    }
    case "alreadySatisfied":
      return { label: `!! ${p[1]} ahead`, cls: "tag--ahead", isAhead: true };
    case "notRequired":
      return { label: `~ ${p[1]}`, cls: "tag--muted", isAhead: false };
    case "advanced": {
      const dest = p[1] === "done" ? "done" : `step ${parseInt(p[1]) + 1}`;
      return { label: `→ ${dest}`, cls: "tag--advanced", isAhead: false };
    }
    default:
      return { label: r, cls: "tag--muted", isAhead: false };
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

interface Issue {
  text: string;
  severity: "error" | "warning" | "info" | "ok";
}

function analyzeLog(entries: LogEntry[]): Issue[] {
  const issues: Issue[] = [];

  // ── 1. Played-ahead: note-on that produced alreadySatisfied ──────────────
  const aheadEntries = entries.filter(
    (e) => e.isOn && e.results.some((r) => r.startsWith("alreadySatisfied"))
  );
  if (aheadEntries.length > 0) {
    const steps = [
      ...new Set(aheadEntries.map((e) => e.stepIndex + 1)),
    ].sort((a, b) => a - b);
    issues.push({
      severity: "error",
      text:
        `Played ahead of the engine: ${aheadEntries.length} event(s) on step(s) ${steps.join(", ")}. ` +
        `A note for the next step was pressed while the engine was still completing the current ` +
        `step's press–release cycle. The engine discarded it as a duplicate, then advanced — ` +
        `but never saw a fresh note-on at the new step because the key was already held. ` +
        `The engine then stalled until the key was lifted and re-pressed. ` +
        `Play slightly more detached (lift each key before pressing the next) to avoid this.`,
    });
  }

  // ── 2. Dead steps: engine advanced to N but no correct:*:N followed ──────
  //    (confirms the "played ahead" stall)
  let deadCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const advToken = entries[i].results.find((r) => r.startsWith("advanced:"));
    if (!advToken) continue;
    const dest = advToken.split(":")[1];
    if (dest === "done") continue;
    const nextStep = parseInt(dest);
    const after = entries.slice(i + 1);
    const hasCorrect = after.some((e) =>
      e.results.some(
        (r) => r.startsWith("correct:") && r.split(":")[2] === String(nextStep)
      )
    );
    const hasLaterAdvance = after.some((e) =>
      e.results.some(
        (r) =>
          r.startsWith("advanced:") &&
          r.split(":")[1] !== String(nextStep)
      )
    );
    if (hasLaterAdvance && !hasCorrect) deadCount++;
  }
  if (deadCount > 0) {
    issues.push({
      severity: "error",
      text:
        `${deadCount} step(s) advanced without a registered note-on at the new step — ` +
        `the required key was already physically held when the engine arrived there. ` +
        `This confirms the play-ahead stall pattern above.`,
    });
  }

  // ── 3. Wrong notes ────────────────────────────────────────────────────────
  const wrongEntries = entries.filter(
    (e) => e.isOn && e.results.some((r) => r.startsWith("wrong:"))
  );
  if (wrongEntries.length > 0) {
    const byStep: Record<number, number> = {};
    wrongEntries.forEach((e) => {
      byStep[e.stepIndex] = (byStep[e.stepIndex] ?? 0) + 1;
    });
    const hotSpots = Object.entries(byStep)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([s, c]) => `step ${Number(s) + 1} (×${c})`);
    issues.push({
      severity: "warning",
      text: `${wrongEntries.length} wrong note event(s). Hot spots: ${hotSpots.join(", ")}.`,
    });
  }

  // ── 4. Restarts ───────────────────────────────────────────────────────────
  const restarts = entries.filter((e) => e.triggeredRestart);
  if (restarts.length > 0) {
    const times = restarts.map((e) => `${(e.ms / 1000).toFixed(1)} s`).join(", ");
    issues.push({
      severity: "info",
      text: `Lesson restarted ${restarts.length} time(s) via C3+C4 gesture (at ${times}).`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "ok",
      text: "No synchronisation issues detected — all steps completed with clean note-on events.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Entry row background class
// ---------------------------------------------------------------------------

function entryRowClass(entry: LogEntry): string {
  if (entry.triggeredRestart) return "debug-entry debug-entry--restart";
  if (entry.results.some((r) => r.startsWith("alreadySatisfied")))
    return "debug-entry debug-entry--ahead";
  if (entry.results.some((r) => r.startsWith("wrong:")))
    return "debug-entry debug-entry--wrong";
  return "debug-entry";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DebugPanel({ log, onClose }: Props) {
  const { entries } = log;
  const issues = analyzeLog(entries);

  return (
    <div className="debug-overlay" onClick={onClose}>
      <div className="debug-panel" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="debug-panel__header">
          <h2 className="debug-panel__title">Analysis Log</h2>
          <span className="debug-panel__count">{entries.length} events</span>
          <button className="debug-panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Auto-analysis */}
        <div className="debug-analysis">
          {issues.map((issue, i) => (
            <p key={i} className={`debug-issue debug-issue--${issue.severity}`}>
              {issue.text}
            </p>
          ))}
        </div>

        {/* Event timeline */}
        <div className="debug-timeline">
          {/* Column headings */}
          <div className="debug-entry debug-entry--header">
            <span className="debug-entry__time">ms</span>
            <span className="debug-entry__dir">↕</span>
            <span className="debug-entry__note">note</span>
            <span className="debug-entry__step">step</span>
            <span className="debug-entry__tags">results</span>
          </div>

          {entries.map((entry, i) => {
            const parsed = entry.results.map(parseResult);
            return (
              <div key={i} className={entryRowClass(entry)}>
                <span className="debug-entry__time">{entry.ms}</span>
                <span className="debug-entry__dir">
                  {entry.triggeredRestart ? "↺" : entry.isOn ? "▼" : "▲"}
                </span>
                <span className="debug-entry__note">
                  {noteName(entry.note)}{" "}
                  <span style={{ opacity: 0.5 }}>({entry.note})</span>
                </span>
                <span className="debug-entry__step">
                  {entry.stepIndex + 1}
                </span>
                <span className="debug-entry__tags">
                  {parsed.length === 0 ? (
                    <span className="tag tag--muted">—</span>
                  ) : (
                    parsed.map((p, j) => (
                      <span key={j} className={`tag ${p.cls}`}>
                        {p.label}
                      </span>
                    ))
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
