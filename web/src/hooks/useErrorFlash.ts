import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

export interface ErrorFlash {
  hand: "left" | "right";
  /** MIDI number of the wrong note the user played. */
  played: number;
  /** Step index the engine was on when the error occurred. */
  atStepIndex: number;
}

/// Watches the snapshot's per-hand status. When either hand
/// transitions into `wrong`, exposes a transient `ErrorFlash` value
/// for `durationMs` (default 700) and then clears it. Multiple wrong
/// notes in quick succession reset the timer; we always reflect the
/// most recent error.
///
/// Returns `null` when no error is currently being flashed.
export function useErrorFlash(
  snapshot: Snapshot | null,
  durationMs = 700
): ErrorFlash | null {
  const [flash, setFlash] = useState<ErrorFlash | null>(null);

  // Track the previous "wrong" sample so we only react to fresh
  // wrong-note transitions, not to a stable wrong status held over
  // several snapshots.
  const lastSeenRef = useRef<{ left?: number; right?: number }>({});
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    const stepIdx = snapshot.lesson.currentStepIndex;

    const checks: Array<{ hand: "left" | "right"; status: typeof snapshot.handStatus.left }> = [
      { hand: "left", status: snapshot.handStatus.left },
      { hand: "right", status: snapshot.handStatus.right }
    ];

    for (const { hand, status } of checks) {
      if (status.kind === "wrong") {
        const seen = lastSeenRef.current[hand];
        // Fire once per fresh wrong status. We approximate "fresh" as
        // "different played note OR moved to a different step".
        const cookie = stepIdx * 1000 + status.played;
        if (seen !== cookie) {
          lastSeenRef.current[hand] = cookie;
          setFlash({ hand, played: status.played, atStepIndex: stepIdx });
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = window.setTimeout(() => {
            setFlash(null);
            timerRef.current = null;
          }, durationMs);
        }
      } else {
        // Status is no longer "wrong" - reset the seen cookie so a
        // future wrong note on the same step+played combo can fire
        // again.
        lastSeenRef.current[hand] = undefined;
      }
    }
  }, [snapshot, durationMs]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return flash;
}
