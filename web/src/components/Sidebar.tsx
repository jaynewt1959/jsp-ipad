import type { Command, HandMode, Snapshot } from "../types";
import type { ConnectionStatus } from "../api/ws";
import { KEY_SPECS } from "../data/scales";

const BPM_PRESETS = [60, 80, 100, 120] as const;

interface Props {
  snapshot: Snapshot | null;
  connection: ConnectionStatus;
  send: (cmd: Command) => void;
  /** Beat phase 0–1 from useMetronome; drives the visual pulse. */
  beatPhase: number;
  /** Whether the lesson will auto-restart on completion. */
  loopMode: boolean;
  /** Set loop mode on/off (does not restart). */
  onSetLoopMode: (loop: boolean) => void;
  /** Restart immediately (does not change loop mode). */
  onReset: () => void;
}

export function Sidebar({ snapshot, connection, send, beatPhase, loopMode, onSetLoopMode, onReset }: Props) {
  const lesson = snapshot?.lesson;
  const midi = snapshot?.midi;
  const metro = snapshot?.metronome ?? { enabled: false, bpm: 80 };

  const currentKey = lesson?.key ?? "cMajor";
  const isMinor    = currentKey.includes("Natural");

  return (
    <aside className="sidebar">
      <button
        className={`btn btn--midi-toggle ${midi?.running ? "btn--midi-toggle--on" : ""}`}
        onClick={() => send({ type: midi?.running ? "stopMidi" : "startLesson" })}
        disabled={connection.kind !== "open"}
      >
        {midi?.running ? "⬤ Disconnect MIDI" : "Connect MIDI"}
      </button>

      <section className="sidebar__section">
        <h2 className="sidebar__section-title">Practice Style</h2>
        <div className="sidebar__practice-style">
          <button
            className={`btn btn--style ${!metro.enabled ? "btn--style-active" : ""}`}
            onClick={() => {
              send({ type: "setMetronome", metronomeEnabled: false, metronomeBpm: metro.bpm });
              send({ type: "restartLesson" });
            }}
            disabled={connection.kind !== "open"}
          >
            Free
          </button>
          <button
            className={`btn btn--style ${metro.enabled ? "btn--style-active" : ""}`}
            onClick={() => {
              send({ type: "setMetronome", metronomeEnabled: true, metronomeBpm: metro.bpm });
              send({ type: "restartLesson" });
            }}
            disabled={connection.kind !== "open"}
          >
            ♪ Timed
          </button>
        </div>
      </section>

      <section className="sidebar__section">
        <div className="sidebar__section-title-row">
          <h2 className="sidebar__section-title">Tempo (BPM)</h2>
          {metro.enabled && midi?.running && !(lesson?.isCompleted ?? false) && (
            <span
              className="sidebar__beat-pulse sidebar__beat-pulse--title"
              style={{ opacity: 0.25 + 0.75 * (1 - beatPhase) }}
              aria-hidden
            />
          )}
        </div>
        <div className="sidebar__metronome">
          <div className="sidebar__bpm-row">
            {BPM_PRESETS.map(bpm => (
              <button
                key={bpm}
                className={`btn btn--bpm ${metro.bpm === bpm ? "btn--bpm-active" : ""}`}
                onClick={() => send({ type: "setMetronome", metronomeEnabled: true, metronomeBpm: bpm })}
                disabled={connection.kind !== "open" || !metro.enabled}
              >
                {bpm}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sidebar__section">
        <h2 className="sidebar__section-title">Practice Mode</h2>
        <div className="sidebar__hand-mode">
          {([
            { mode: "leftOnly"  as HandMode, label: "Left Hand" },
            { mode: "rightOnly" as HandMode, label: "Right Hand" },
            { mode: "together"  as HandMode, label: "Both Hands" },
          ] as const).map(({ mode, label }) => (
            <button
              key={mode}
              className={[
                "btn", "btn--hand",
                `btn--hand-${mode}`,
                lesson?.handsMode === mode ? "btn--hand-active" : "",
              ].join(" ")}
              onClick={() => send({ type: "setHandMode", handMode: mode })}
              disabled={connection.kind !== "open"}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar__section">
        <h2 className="sidebar__section-title">Scale</h2>
        <div className="sidebar__practice-style">
          <button
            className={`btn btn--style ${!isMinor ? "btn--style-active" : ""}`}
            onClick={() => {
              const spec = KEY_SPECS.find(s => s.majorKey === currentKey || s.minorKey === currentKey);
              send({ type: "setScale", scaleKey: spec?.majorKey ?? "cMajor" });
            }}
            disabled={connection.kind !== "open"}
          >
            Major
          </button>
          <button
            className={`btn btn--style ${isMinor ? "btn--style-active" : ""}`}
            onClick={() => {
              const spec = KEY_SPECS.find(s => s.majorKey === currentKey || s.minorKey === currentKey);
              send({ type: "setScale", scaleKey: spec?.minorKey ?? "cNaturalMinor" });
            }}
            disabled={connection.kind !== "open"}
          >
            Nat. Minor
          </button>
        </div>
        <div className="sidebar__key-grid">
          {KEY_SPECS.map(spec => {
            const isActive = currentKey === spec.majorKey || currentKey === spec.minorKey;
            const targetKey = isMinor ? spec.minorKey : spec.majorKey;
            return (
              <button
                key={spec.label}
                className={`btn btn--key ${isActive ? "btn--key-active" : ""}`}
                onClick={() => send({ type: "setScale", scaleKey: targetKey })}
                disabled={connection.kind !== "open"}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="sidebar__section">
        <h2 className="sidebar__section-title">Direction</h2>
        <div className="sidebar__direction">
          {([
            { dir: "ascending"           as const, label: "\u2191 Asc" },
            { dir: "descending"          as const, label: "\u2193 Desc" },
            { dir: "ascendingDescending" as const, label: "\u21f5 Both" },
          ]).map(({ dir, label }) => (
            <button
              key={dir}
              className={`btn btn--style ${lesson?.direction === dir ? "btn--style-active" : ""}`}
              onClick={() => send({ type: "setDirection", direction: dir })}
              disabled={connection.kind !== "open"}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar__section sidebar__section--connection">
        <h2 className="sidebar__section-title">Controls</h2>
        <div className="sidebar__buttons">
          <div className="sidebar__practice-style">
            <button
              className={`btn btn--style ${!loopMode ? "btn--style-active" : ""}`}
              onClick={() => onSetLoopMode(false)}
              disabled={connection.kind !== "open"}
            >
              Once
            </button>
            <button
              className={`btn btn--style ${loopMode ? "btn--style-active" : ""}`}
              onClick={() => onSetLoopMode(true)}
              disabled={connection.kind !== "open"}
            >
              ⟳ Loop
            </button>
          </div>
          <button
            className="btn btn--restart"
            onClick={onReset}
            disabled={connection.kind !== "open" || !(midi?.running ?? false)}
          >
            Reset
          </button>
          <button
            className="btn btn--debug"
            onClick={() => send({ type: "requestDebugLog" })}
            disabled={connection.kind !== "open"}
          >
            Analyze
          </button>
        </div>
      </section>
    </aside>
  );
}
