// Dev-only diagnostic: measures the round trip from an on-screen key
// tap (simulateNote sent) to the next snapshot arriving. Displayed in
// the build-timestamp bar in dev builds. Helps localise tap latency:
// a large number here with fast server handling (see the
// SessionCoordinator simulateNote log) points at transport or
// client-side stalls.

let tapSentAt: number | null = null;
let lastLatencyMs: number | null = null;

/** Call when a tap's simulateNote command is sent. */
export function markTapSent(): void {
  tapSentAt = performance.now();
}

/** Call when any snapshot arrives; pairs with the most recent tap. */
export function markSnapshotReceived(): void {
  if (tapSentAt != null) {
    lastLatencyMs = Math.round(performance.now() - tapSentAt);
    tapSentAt = null;
  }
}

/** Most recent tap→snapshot latency, or null before the first tap. */
export function lastTapLatencyMs(): number | null {
  return lastLatencyMs;
}

// Press duration as seen by JS (pointerdown → pointerup). A quick
// human tap is ~60–150 ms; a large first-tap value with a fast
// tap→snap round trip means the *native* layer delivered pointerup
// late (gesture-recognizer arbitration), not that the app was slow.
let pressStartedAt: number | null = null;
let lastPressMs: number | null = null;

export function markPressStart(): void {
  pressStartedAt = performance.now();
}

export function markPressEnd(): void {
  if (pressStartedAt != null) {
    lastPressMs = Math.round(performance.now() - pressStartedAt);
    pressStartedAt = null;
  }
}

export function lastPressDurationMs(): number | null {
  return lastPressMs;
}
