import type { Command, HandMode, Snapshot } from "../types";
import type { ConnectionStatus } from "../api/ws";
import type { PlayMode } from "../hooks/usePersistedSettings";
import type { CycleOrder } from "../data/cycleOrders";
import { KEY_SPECS, specForKey, minorKeyFor, minorVariantOf, isMinorKey, type MinorVariant } from "../data/scales";

const BPM_PRESETS = [60, 80, 100, 120] as const;

interface Props {
  snapshot: Snapshot | null;
  connection: ConnectionStatus;
  send: (cmd: Command) => void;
  /** Beat phase 0–1 from useMetronome; drives the visual pulse. */
  beatPhase: number;
  playMode: PlayMode;
  onSetPlayMode: (mode: PlayMode) => void;
  cycleOrder: CycleOrder;
  onSetCycleOrder: (order: CycleOrder) => void;
  /** Active minor sub-type and its setter (persisted in App). */
  minorVariant: MinorVariant;
  onSetMinorVariant: (v: MinorVariant) => void;
  /** Restart immediately (does not change play mode). */
  onReset: () => void;
  /** Key labels playable on the active keyboard in the current hand mode. */
  availableKeys: Set<string>;
  /** Whether each hand mode has at least one playable key. */
  modeAvailability: Record<HandMode, boolean>;
  /** Cycle needs all 12 keys playable in the current hand mode. */
  cycleAvailable: boolean;
}

export function Sidebar({
  snapshot, connection, send, beatPhase,
  playMode, onSetPlayMode,
  cycleOrder, onSetCycleOrder,
  minorVariant, onSetMinorVariant,
  onReset,
  availableKeys, modeAvailability, cycleAvailable,
}: Props) {
  const lesson = snapshot?.lesson;
  const midi = snapshot?.midi;
  const metro = snapshot?.metronome ?? { enabled: false, bpm: 80 };

  const currentKey   = lesson?.key ?? "cMajor";
  const isMinor      = isMinorKey(currentKey);
  // Highlight the variant of the current key when on a minor; otherwise the
  // remembered (persisted) sub-type so toggling Major↔Minor returns to it.
  const activeVariant = minorVariantOf(currentKey) ?? minorVariant;
  const activeSpec    = specForKey(currentKey);

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
                !modeAvailability[mode] ? "btn--unavailable" : "",
              ].join(" ")}
              onClick={() => send({ type: "setHandMode", handMode: mode })}
              disabled={connection.kind !== "open" || !modeAvailability[mode]}
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
              const spec = specForKey(currentKey);
              send({ type: "setScale", scaleKey: spec.majorKey });
            }}
            disabled={connection.kind !== "open"}
          >
            Major
          </button>
          <button
            className={`btn btn--style ${isMinor ? "btn--style-active" : ""}`}
            onClick={() => {
              const spec = specForKey(currentKey);
              send({ type: "setScale", scaleKey: minorKeyFor(spec, minorVariant) });
            }}
            disabled={connection.kind !== "open"}
          >
            Minor
          </button>
        </div>
        <div className="sidebar__practice-style sidebar__minor-variant">
          {([
            { v: "natural"  as MinorVariant, label: "Natural" },
            { v: "harmonic" as MinorVariant, label: "Harmonic" },
            { v: "melodic"  as MinorVariant, label: "Melodic" },
          ]).map(({ v, label }) => (
            <button
              key={v}
              className={`btn btn--style ${isMinor && activeVariant === v ? "btn--style-active" : ""}`}
              onClick={() => {
                onSetMinorVariant(v);
                const spec = specForKey(currentKey);
                send({ type: "setScale", scaleKey: minorKeyFor(spec, v) });
              }}
              disabled={connection.kind !== "open" || !isMinor}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar__key-grid">
          {KEY_SPECS.map(spec => {
            const isActive = spec.label === activeSpec.label;
            const targetKey = isMinor ? minorKeyFor(spec, activeVariant) : spec.majorKey;
            const available = availableKeys.has(spec.label);
            return (
              <button
                key={spec.label}
                className={`btn btn--key ${isActive ? "btn--key-active" : ""} ${!available ? "btn--unavailable" : ""}`}
                onClick={() => send({ type: "setScale", scaleKey: targetKey })}
                disabled={connection.kind !== "open" || !available}
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

      <section className="sidebar__section">
        <h2 className="sidebar__section-title">Controls</h2>
        <div className="sidebar__buttons">
          <div className="sidebar__direction">
            {(["once", "loop", "cycle"] as const).map(mode => {
              const unavailable = mode === "cycle" && !cycleAvailable;
              return (
                <button
                  key={mode}
                  className={`btn btn--style ${playMode === mode ? "btn--style-active" : ""} ${unavailable ? "btn--unavailable" : ""}`}
                  onClick={() => { onSetPlayMode(mode); send({ type: "restartLesson" }); }}
                  disabled={connection.kind !== "open" || unavailable}
                >
                  {mode === "once" ? "Once" : mode === "loop" ? "Loop" : "Cycle"}
                </button>
              );
            })}
          </div>

          <div className="sidebar__practice-style">
            {(["random", "fifths"] as const).map(o => (
              <button
                key={o}
                className={`btn btn--style ${cycleOrder === o && playMode === "cycle" ? "btn--style-active" : ""}`}
                onClick={() => onSetCycleOrder(o)}
                disabled={connection.kind !== "open" || playMode !== "cycle"}
              >
                {o === "random" ? "Random" : "Fifths"}
              </button>
            ))}
          </div>

          <button
            className="btn btn--restart"
            onClick={onReset}
            disabled={connection.kind !== "open" || !(midi?.running ?? false)}
          >
            Reset
          </button>
          {__DEV_TOOLS__ && (
            <button
              className="btn btn--debug"
              onClick={() => send({ type: "requestDebugLog" })}
              disabled={connection.kind !== "open" || !(midi?.running ?? false)}
            >
              Analyze
            </button>
          )}
        </div>
      </section>
    </aside>
  );
}
