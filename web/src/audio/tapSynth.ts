// tapSynth — Web Audio piano-ish tone for on-screen key taps (demo mode).
//
// Pitched at the tapped key (A440 equal temperament). Each noteOn
// starts a small additive voice (triangle fundamental + two soft sine
// harmonics) with a fast attack and a natural exponential decay capped
// at ~1.5 s; noteOff applies a quick release so the tone stops when the
// finger lifts — matching the engine's press/release model. Every tap
// sounds, including wrong notes, exactly like a real piano.
//
// The AudioContext is created lazily on the first tap — taps are user
// gestures, so iOS's autoplay policy is satisfied. Deliberately a
// separate context from the metronome's (useMetronome.ts) so neither
// feature's gain scheduling interferes with the other.
//
// Tap-only by construction: this module is invoked from the
// KeyboardStrip onKey path, which is live only while no physical MIDI
// keyboard is active (physical keyboards make their own sound).

interface Voice {
  gain: GainNode;
}

const ATTACK_SEC = 0.005; // fast, percussive onset
const DECAY_SEC = 1.5;    // natural decay cap while the finger is held
const RELEASE_SEC = 0.09; // quick fade when the finger lifts

/** Fundamental + softer harmonics for a warm, piano-ish timbre. */
const PARTIALS: ReadonlyArray<{ mult: number; level: number; type: OscillatorType }> = [
  { mult: 1, level: 0.5, type: "triangle" },
  { mult: 2, level: 0.18, type: "sine" },
  { mult: 3, level: 0.08, type: "sine" },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const voices = new Map<number, Voice>();

function ensureContext(): { c: AudioContext; m: GainNode } | null {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5; // headroom alongside the metronome clicks
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return master ? { c: ctx, m: master } : null;
}

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Fade out and forget the voice for `midi`, if any. */
function stopVoice(midi: number, immediate: boolean) {
  const v = voices.get(midi);
  if (!v || !ctx) return;
  voices.delete(midi);
  const now = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  if (immediate) {
    v.gain.gain.setValueAtTime(0, now);
  } else {
    // Anchor at the current level, then a short exponential release.
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0011), now);
    v.gain.gain.exponentialRampToValueAtTime(0.001, now + RELEASE_SEC);
  }
  // Oscillators already carry scheduled stops; just detach the voice
  // after the release tail so the graph doesn't accumulate nodes.
  setTimeout(() => v.gain.disconnect(), (RELEASE_SEC + 0.05) * 1000);
}

/** Start the tone for a tapped key. Retriggers cleanly if already sounding. */
export function tapNoteOn(midi: number): void {
  const env = ensureContext();
  if (!env) return;
  const { c, m } = env;
  stopVoice(midi, true);

  const now = c.currentTime;
  const gain = c.createGain();
  gain.connect(m);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + ATTACK_SEC);
  gain.gain.exponentialRampToValueAtTime(0.001, now + DECAY_SEC);

  const f = midiToFreq(midi);
  for (const { mult, level, type } of PARTIALS) {
    const osc = c.createOscillator();
    const partGain = c.createGain();
    partGain.gain.value = level;
    osc.type = type;
    osc.frequency.value = f * mult;
    osc.connect(partGain);
    partGain.connect(gain);
    osc.start(now);
    osc.stop(now + DECAY_SEC + RELEASE_SEC);
  }

  voices.set(midi, { gain });
}

/** Stop the tone for a released key with a short, click-free fade. */
export function tapNoteOff(midi: number): void {
  stopVoice(midi, false);
}

/** Pre-warm the audio pipeline at app load (called from App mount).
 *  The WKWebView host sets `mediaTypesRequiringUserActionForPlayback`
 *  to none, so the context starts immediately; a near-silent priming
 *  voice forces the output route to open. Without this, the first
 *  real tap paid the whole spin-up cost inside the pointer event:
 *  the context's clock was still frozen, the release ramp clobbered
 *  the attack, and the first note was swallowed. In a plain desktop
 *  browser (dev) autoplay may be blocked — then this is a harmless
 *  no-op and the first tap's `ensureContext()` resume takes over. */
export function warmUpTapSynth(): void {
  const env = ensureContext();
  if (!env) return;
  const { c, m } = env;
  const osc = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.0001;
  osc.frequency.value = 440;
  osc.connect(g);
  g.connect(m);
  const now = c.currentTime;
  osc.start(now);
  osc.stop(now + 0.03);
}
