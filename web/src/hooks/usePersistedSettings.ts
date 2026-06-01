import { useEffect, useRef, useCallback } from "react";
import type { Command, Snapshot } from "../types";
import type { ConnectionStatus } from "../api/ws";

const STORAGE_KEY = "jsp-settings";

interface SavedSettings {
  scaleKey: string;
  handMode: string;
  direction: string;
  metronomeEnabled: boolean;
  metronomeBpm: number;
  loopMode: boolean;
}

function load(): SavedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSettings) : null;
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
  setLoopMode: (v: boolean) => void,
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
    setLoopMode(saved.loopMode);
  }, [connection.kind, snapshot, rawSend, setLoopMode]);

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
        loopMode: false,
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

  // Persist loop mode changes (loop mode is client-only, not a command).
  const persistLoopMode = useCallback(
    (loop: boolean) => {
      setLoopMode(loop);
      const prev = load();
      if (prev) save({ ...prev, loopMode: loop });
    },
    [setLoopMode],
  );

  return { send, persistLoopMode };
}

/** Read saved loopMode for initial state (before hook mounts). */
export function loadSavedLoopMode(): boolean {
  return load()?.loopMode ?? false;
}
