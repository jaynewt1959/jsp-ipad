import { useEffect, useRef, useCallback } from "react";
import type { Command, Snapshot } from "../types";
import type { ConnectionStatus } from "../api/ws";
import type { CycleOrder } from "../data/cycleOrders";

export type PlayMode = "once" | "loop" | "cycle";

const STORAGE_KEY = "jsp-settings";

interface SavedSettings {
  scaleKey: string;
  handMode: string;
  direction: string;
  metronomeEnabled: boolean;
  metronomeBpm: number;
  playMode: PlayMode;
  cycleOrder: CycleOrder;
}

/** Legacy shape — only used for one-time migration. */
interface LegacySettings {
  loopMode?: boolean;
  playMode?: PlayMode;
}

function load(): SavedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSettings & LegacySettings;
    // Migrate old loopMode boolean → playMode string.
    if (parsed.playMode === undefined && (parsed as LegacySettings).loopMode !== undefined) {
      parsed.playMode = (parsed as LegacySettings).loopMode ? "loop" : "once";
      delete (parsed as any).loopMode;
      save(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

function save(s: SavedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/**
 * Persists sidebar settings to localStorage.
 *
 * - Intercepts outgoing commands to capture setting changes.
 * - On first connection, restores saved settings by sending commands.
 * - Returns the wrapped `send` and the saved loopMode for initial state.
 */
export function usePersistedSettings(
  rawSend: (cmd: Command) => void,
  connection: ConnectionStatus,
  snapshot: Snapshot | null,
  setPlayMode: (v: PlayMode) => void,
  setCycleOrder: (v: CycleOrder) => void,
) {
  const restoredRef = useRef(false);

  // Restore saved settings once when we first connect and get a snapshot.
  useEffect(() => {
    if (restoredRef.current) return;
    if (connection.kind !== "open" || !snapshot) return;
    restoredRef.current = true;

    const saved = load();
    if (!saved) return;

    // Only send commands where the saved value differs from server defaults.
    if (saved.scaleKey !== snapshot.lesson.key) {
      rawSend({ type: "setScale", scaleKey: saved.scaleKey });
    }
    if (saved.handMode !== snapshot.lesson.handsMode) {
      rawSend({ type: "setHandMode", handMode: saved.handMode as any });
    }
    if (saved.direction !== snapshot.lesson.direction) {
      rawSend({ type: "setDirection", direction: saved.direction as any });
    }
    if (
      saved.metronomeEnabled !== snapshot.metronome.enabled ||
      saved.metronomeBpm !== snapshot.metronome.bpm
    ) {
      rawSend({
        type: "setMetronome",
        metronomeEnabled: saved.metronomeEnabled,
        metronomeBpm: saved.metronomeBpm,
      });
    }
    setPlayMode(saved.playMode ?? "once");
    if (saved.cycleOrder) setCycleOrder(saved.cycleOrder);
  }, [connection.kind, snapshot, rawSend, setPlayMode, setCycleOrder]);

  // Wrap send to intercept setting commands and persist them.
  const send = useCallback(
    (cmd: Command) => {
      rawSend(cmd);

      const prev = load();
      const cur: SavedSettings = prev ?? {
        scaleKey: "cMajor",
        handMode: "rightOnly",
        direction: "ascending",
        metronomeEnabled: false,
        metronomeBpm: 80,
        playMode: "once",
        cycleOrder: "random",
      };

      switch (cmd.type) {
        case "setScale":
          save({ ...cur, scaleKey: cmd.scaleKey });
          break;
        case "setHandMode":
          save({ ...cur, handMode: cmd.handMode });
          break;
        case "setDirection":
          save({ ...cur, direction: cmd.direction });
          break;
        case "setMetronome":
          save({
            ...cur,
            metronomeEnabled: cmd.metronomeEnabled,
            metronomeBpm: cmd.metronomeBpm,
          });
          break;
      }
    },
    [rawSend],
  );

  // Persist play mode changes (client-only, not a command).
  const persistPlayMode = useCallback(
    (mode: PlayMode) => {
      setPlayMode(mode);
      const prev = load();
      if (prev) save({ ...prev, playMode: mode });
    },
    [setPlayMode],
  );

  const persistCycleOrder = useCallback(
    (order: CycleOrder) => {
      setCycleOrder(order);
      const prev = load();
      if (prev) save({ ...prev, cycleOrder: order });
    },
    [setCycleOrder],
  );

  return { send, persistPlayMode, persistCycleOrder };
}

/** Read saved playMode for initial state (before hook mounts). */
export function loadSavedPlayMode(): PlayMode {
  const saved = load();
  return saved?.playMode ?? "once";
}

export function loadSavedCycleOrder(): CycleOrder {
  return load()?.cycleOrder ?? "random";
}
