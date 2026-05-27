// useMetronome — Web Audio API lookahead scheduler
//
// Plays a short click on every quarter-note beat.  The beat grid is
// anchored to `lessonStartMs` (Unix-epoch ms from the server snapshot)
// so it stays phase-locked with the server's timing evaluation.
//
// Scheduling strategy (Paul Batchelor / Chris Wilson pattern):
//   A setInterval fires every LOOK_INTERVAL_MS (~25 ms) and schedules
//   any clicks that fall within the next LOOK_AHEAD_MS (100 ms) using
//   AudioContext.currentTime.  This decouples the imprecise JS timer
//   from the sample-accurate audio clock and avoids audible jitter.
//
// Audio-latency compensation:
//   Each click is scheduled context.outputLatency seconds *early* so
//   it arrives at the speaker at exactly the intended beat time.
//
// Lesson-restart handling:
//   When lessonStartMs changes we do NOT recreate the effect (which
//   would create a JS/audio-thread race).  Instead the setInterval
//   detects the change via a ref and schedules a MUTE_WINDOW_SEC
//   silence INSIDE the audio timeline — the audio thread itself
//   enforces it, so it is 100 % race-free.  The new beat grid starts
//   after the mute window ends.

import { useEffect, useRef, useState } from "react";

const LOOK_AHEAD_MS    = 100;   // schedule clicks this far ahead
const LOOK_INTERVAL_MS = 25;    // polling interval
/** Silence window injected on lesson restart (ms).  Must be > LOOK_AHEAD_MS
 *  so any already-queued clicks from the old grid are covered. */
const MUTE_WINDOW_MS   = 150;

interface MetronomeHook {
  /** Current beat phase 0–1 (0 = beat just fired, 1 = about to fire).
   *  Updates ~4× per beat for the visual pulse.  0 when stopped. */
  beatPhase: number;
}

export function useMetronome(
  bpm: number,
  enabled: boolean,
  lessonStartMs: number,  // Unix-epoch ms from snapshot.lesson.lessonStartMs
  clockSkewMs: number     // snapshot.serverTimeMs - Date.now() at last snapshot
): MetronomeHook {
  const [beatPhase, setBeatPhase] = useState(0);

  const ctxRef         = useRef<AudioContext | null>(null);
  const nextBeatRef    = useRef<number>(0);
  const masterGainRef  = useRef<GainNode | null>(null);
  /** Beat position within the bar: 0 = downbeat, 1–3 = off-beats. */
  const beatInBarRef   = useRef<number>(0);

  // Live refs — updated every render so the interval reads current values
  // without the effect needing to re-run.
  const bpmRef          = useRef(bpm);
  const enabledRef      = useRef(enabled);
  const startMsRef      = useRef(lessonStartMs);
  const clockSkewRef    = useRef(clockSkewMs);
  /** The lessonStartMs value the beat grid is currently synced to. */
  const syncedStartMsRef = useRef<number>(0);

  bpmRef.current     = bpm;
  enabledRef.current = enabled;
  startMsRef.current = lessonStartMs;
  clockSkewRef.current = clockSkewMs;

  // The effect only depends on `enabled`.  Lesson restarts are handled
  // inside the interval via refs so that no JS-level teardown/rebuild
  // races with the audio thread.
  useEffect(() => {
    if (!enabled) {
      setBeatPhase(0);
      return;
    }

    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;
    // Force a grid sync on the first interval tick.
    syncedStartMsRef.current = 0;

function scheduleClick(at: number, downbeat: boolean) {
      const c  = ctxRef.current;
      const mg = masterGainRef.current;
      if (!c || !mg) return;
      const scheduled = at - (c.outputLatency ?? 0);
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(mg);
      // Downbeat: higher pitch + louder; off-beats: softer
      osc.frequency.value = downbeat ? 1200 : 880;
      const peak = downbeat ? 0.55 : 0.30;
      gain.gain.setValueAtTime(0, scheduled);
      gain.gain.linearRampToValueAtTime(peak, scheduled + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, scheduled + 0.040);
      osc.start(scheduled);
      osc.stop(scheduled + 0.050);
    }

    const interval = setInterval(() => {
      if (!enabledRef.current || !ctxRef.current || !masterGainRef.current) return;
      const c  = ctxRef.current;
      const mg = masterGainRef.current;
      const currentStartMs = startMsRef.current;

      // ── Lesson restart: re-sync the beat grid ──────────────────────────
      // When lessonStartMs changes, schedule a mute window *in the audio
      // timeline* (not via JS-level disconnect which races the audio
      // thread).  The mute covers MUTE_WINDOW_MS so all already-queued
      // clicks from the old grid are silenced.  The first new beat is
      // placed immediately after the mute window.
      if (currentStartMs !== 0 && currentStartMs !== syncedStartMsRef.current) {
        syncedStartMsRef.current = currentStartMs;

        const muteWindowSec = MUTE_WINDOW_MS / 1000;
        const muteUntilCtx  = c.currentTime + muteWindowSec;

        // Schedule silence window, then restore gain — all in audio time.
        mg.gain.cancelScheduledValues(c.currentTime);
        mg.gain.setValueAtTime(0, c.currentTime);
        mg.gain.setValueAtTime(1, muteUntilCtx);

        // Find the first beat on the new grid that falls after the mute.
        // Both muteEnd and currentStartMs must be in the same clock domain
        // (Mac/server time) before comparing.
        const beatPeriodMs  = 60_000 / bpmRef.current;
        const muteEndMacMs  = Date.now() + clockSkewRef.current + MUTE_WINDOW_MS;
        const elapsedMs     = muteEndMacMs - currentStartMs;
        const beatsElapsed   = Math.ceil(elapsedMs / beatPeriodMs);
        const firstBeatMs    = currentStartMs + beatsElapsed * beatPeriodMs;
        // Subtract clock skew so the AudioContext beat fires at Mac-clock
        // time firstBeatMs, not firstBeatMs + skew.
        nextBeatRef.current  = c.currentTime + (firstBeatMs - clockSkewRef.current - Date.now()) / 1000;
        // Always re-anchor the bar so the first audible click is the downbeat.
        beatInBarRef.current = 0;
      }

      // ── Lookahead scheduling ───────────────────────────────────────────
      const beatPeriodSec  = 60 / bpmRef.current;
      const lookahead      = c.currentTime + LOOK_AHEAD_MS / 1000;
      // Clicks before lessonStartMs are count-in beats (quiet, lower pitch).
      // Clicks at or after lessonStartMs are full-volume regular beats.
      while (nextBeatRef.current < lookahead) {
        scheduleClick(nextBeatRef.current, beatInBarRef.current === 0);
        nextBeatRef.current += beatPeriodSec;
        beatInBarRef.current = (beatInBarRef.current + 1) % 4;
      }

      const elapsed = c.currentTime - (nextBeatRef.current - beatPeriodSec);
      setBeatPhase(Math.min(1, elapsed / beatPeriodSec));
    }, LOOK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      masterGain.gain.cancelScheduledValues(0);
      masterGain.gain.setValueAtTime(0, 0);
      masterGain.disconnect();
      setBeatPhase(0);
    };
  }, [enabled]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { beatPhase };
}
