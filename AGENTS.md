# AGENTS.md — jsp-ipad

Notes for AI coding agents. Keep short. Captures things easy to break
or not obvious from a code scan.

## Architecture

SwiftUI shell starts an embedded Hummingbird 2 server + CoreMIDI listener
in-process, then loads the existing React/Vite UI in a full-screen WKWebView.

```
USB MIDI keyboard
  → CoreMIDI (MidiInput.swift)
  → SessionCoordinator (actor)
  → Hummingbird WebSocket on localhost:8089
  → WKWebView → React UI (web/dist bundled in app)
```

The server binds `127.0.0.1` (not `0.0.0.0` — iPad has no
"local-network server" use case) and tries ports **8089 → 8090 → 8091**
in order (`EngineHost.candidatePorts`). `EngineHost` is a state machine
(`idle / starting / running(port) / failed`); `ContentView` polls
`EngineHost.shared.state`, confirms `/healthz`, then loads the actual
port. If the engine fails or doesn't answer within ~12 s, ContentView
shows an error screen with a Retry button (`ensureStarted()` is
idempotent) — never an infinite spinner (App Review rejects hangs).

## Key files

| File | Role |
|------|------|
| `JSPiPad/JSPiPadApp.swift` | `@main` SwiftUI entry, fires `EngineHost.shared.ensureStarted()` as detached task |
| `JSPiPad/ContentView.swift` | WKWebView wrapper; waits on `EngineHost.state` + `/healthz`, loads the active port; timeout → error + Retry |
| `JSPiPad/EngineHost.swift` | Starts Hummingbird with port fallback, registers WS routes, finds `web/dist` in bundle, exposes `State` |
| `Sources/Server/HTTPServer.swift` | `127.0.0.1` binding (differs from Mac which uses `0.0.0.0`) |
| `Sources/Lesson/LessonEngine.swift` | Engine-internal `EngineState` enum (NOT `LessonState` — see below) |
| `project.yml` | xcodegen spec — **source of truth** for the Xcode project |
| `Assets.xcassets/AppIcon.appiconset/` | App icon (must be opaque RGB PNG) |
| `web/src/hooks/useMetronome.ts` | Web Audio API lookahead metronome; accented downbeat on beat 1 of 4/4 |
| `web/src/hooks/useTiming.ts` | Eighth-note timing evaluation; produces per-note quality + cumulative stats |
| `web/src/hooks/useSession.ts` | WebSocket session management |
| `web/src/components/Sidebar.tsx` | All controls: Free/Timed, BPM, hand mode, scale type + minor sub-type + key, direction, Once/Loop/Cycle, Reset |
| `web/src/data/cycleOrders.ts` | Builds ordered scale pools for cyclic practice (random, chromatic, fifths) |
| `web/src/hooks/usePersistedSettings.ts` | Persists sidebar settings (incl. playMode, cycleOrder, minorVariant) to localStorage |
| `web/src/components/PracticePanel.tsx` | Main practice area: step label, keyboard strip, score, feedback, timing stats |
| `web/src/components/KeyboardBar.tsx` | Device/range strip: calibration prompts, source picker, Recalibrate |
| `web/src/util/availability.ts` | Which scale keys fit the calibrated keyboard range per hand mode |
| `web/src/components/KeyboardStrip.tsx` | Piano keyboard display highlighting next expected note(s) |
| `web/src/components/score/ScaleScoreView.tsx` | Staff notation view of the current scale |

## Single-module target — critical difference from Mac

All Swift sources (`JSPiPad/`, `Sources/Lesson/`, `Sources/Server/`,
`Sources/MIDI/`) compile into **one app target** — there is no separate
`JSPCore` module. Consequences:

1. **Never `import JSPCore`** in any file. The Mac code has it; remove it
   in any file copied from `jsp`.
2. **Name collision**: `LessonEngine.swift` had `public enum LessonState`
   (the engine's internal state machine) which clashed with `Wire.swift`'s
   `public struct LessonState` (the wire type). Resolved by renaming the
   engine enum to **`EngineState`** in `LessonEngine.swift`. Don't revert
   this or re-introduce another type named `LessonState` in `Sources/Lesson/`.

## Web UI features — current state

**Scales**: 48 two-octave scales — 12 keys × 4 types (Major, Natural Minor, Harmonic
Minor, Melodic Minor). The Scale section is a two-tier selector: a **Major | Minor** row
plus an always-visible **Natural | Harmonic | Melodic** sub-row that is enabled only when
Minor is active (and highlights the current sub-type). A 12-key grid (C, C♯, D, E♭, E, F,
F♯, G, A♭, A, B♭, B) sets the root while keeping the current type/sub-type. The chosen
minor sub-type is remembered (persisted) so toggling Major↔Minor returns to it. Harmonic
minor raises the 7th (same notes ascending and descending); melodic minor raises the 6th
and 7th ascending and descends as the natural minor. Each scale renders its printed
grand-staff score with per-note fingerings and a live highlight overlay.

**Sidebar controls (top → bottom)**:
- **Connect MIDI** — starts CoreMIDI + the lesson; toggles to Disconnect while running.
- **Practice Style** — Free or ♪ Timed.
- **Tempo (BPM)** — 60 / 80 / 100 / 120 presets; active only in Timed.
- **Practice Mode** — Left Hand / Right Hand / Both Hands.
- **Scale** — type + minor sub-type + 12-key grid (see **Scales** above).
- **Direction** — ↑ Asc / ↓ Desc / ⇅ Both.
- **Controls** — Once / Loop / Cycle; Random / Fifths (Cycle only); Reset; Analyze (dev builds only).

**Practice Style**: Free (no timing evaluation) or Timed (metronome + eighth-note grid scoring).

**Metronome** (`useMetronome.ts`): Web Audio API lookahead scheduler, phase-locked to
`lessonStartMs` from the server snapshot. Beat 1 of each 4/4 bar is accented (1200 Hz,
gain 0.55); beats 2–4 are softer (880 Hz, gain 0.30). `beatInBarRef` is always reset to
`0` on lesson start/restart so the first audible click is always the downbeat. Do not
change this reset to `beatsElapsed % 4` — that was the bug we fixed.

**Timing evaluation** (`useTiming.ts`): evaluates each correct note against the
eighth-note grid. Thresholds: on-time < 15% of an eighth, slightly off < 35%, clearly
off otherwise. Cumulative stats (early/on-time/late %) shown after 5+ notes or on
completion.

**Completion stats** shown in feedback line: elapsed time, accuracy %, mistake count,
sync avg/best/worst (both-hands mode only), fluidity % (derived from `velocityCV`).

**Play mode** (Once / Loop / Cycle): Once plays the scale once then stops; Loop
auto-restarts the same scale with a countdown; Cycle advances to the next scale on
completion with zero mistakes, or auto-retries with a toast on mistakes. Cycle order
is Random (Fisher-Yates, no back-to-back duplicates) or Circle of Fifths. The cycle
pool follows the Scale section's current selection — major keys when Major is active,
otherwise the keys of the active minor sub-type (natural/harmonic/melodic); there is
no separate cycle scale-type selector. Cycle state (pool, index) lives in refs in
`App.tsx`; settings are persisted via `usePersistedSettings`. Switching mode sends
`restartLesson` immediately.

**Reset button**: restarts the current lesson without changing any other settings.

**Analyze button**: sends `requestDebugLog` to the server. Disabled when MIDI is not
running. **Dev builds only** — compiled out of Release via `__DEV_TOOLS__` (see
"Release vs Debug builds" below).

**Build timestamp bar**: thin bar at the top of PracticePanel showing `Build: {__BUILD_TIME__}`
(injected by Vite). Useful for confirming the app on-device matches the latest build.
**Dev builds only** — compiled out of Release via `__DEV_TOOLS__`. (The earlier
last-WS-command readout was removed.)

## Release vs Debug builds (App Store hygiene)

The Xcode preBuildScript passes `VITE_APP_CONFIG="$CONFIGURATION"` to
`npm run build`. In `web/vite.config.ts`, `VITE_APP_CONFIG=Release`
sets the compile-time constant `__DEV_TOOLS__` to `false` and disables
source maps. `__DEV_TOOLS__` gates the build-timestamp bar
(`PracticePanel.tsx`), the Analyze button (`Sidebar.tsx`), and the
`DebugPanel` render (`App.tsx`) — all stripped from App Store builds by
dead-code elimination. Xcode Debug builds and manual `npm run build`
(no env var) keep them. Don't add user-visible debug UI outside the
`__DEV_TOOLS__` gate — App Review reads visible build stamps/debug
tools as "beta app" (Guideline 2.2).

## Wire contract — keep two files in sync

Same contract as the Mac `jsp` repo:

- `Sources/Server/Wire.swift` — server-side types
- `web/src/types.ts` — TypeScript mirror

There is no `docs/protocol.md` in this repo; refer to `../jsp/docs/protocol.md`
if you need the field reference. Do not diverge from the Mac wire format
without a deliberate decision.

**Deliberate divergences** (iPad-only, not in the Mac `jsp` wire format;
port to Mac later if desired):

1. `LessonState.fixedVelocity: Bool` — true when every note-on of the
   current run carried an identical velocity (≥8 samples), i.e. the
   keyboard has no touch response. `velocityCV` is suppressed (null),
   evenness drops out of the stats/composite score, and the UI shows a
   "doesn't report dynamics" notice. Detection is stateless per run
   (reset on every rewind); see `SessionCoordinator.trackVelocity` /
   `fixedVelocityDetected`.
2. `MidiState.activeSource: String?` — display name of the MIDI source
   whose events drive the lesson. Events from other connected sources
   are ignored.
3. `Snapshot.keyboard: KeyboardState` — `{ rangeLow, rangeHigh,
   calibration }`; null range = unknown/full-size.
4. Commands `setActiveSource` (payload `sourceName`), `startCalibration`,
   `cancelCalibration`, `skipCalibration`.

## Keyboard range & calibration

MIDI cannot report a keyboard's key count, so the app learns each
device's range with a 2-press calibration (lowest key, then highest),
triggered automatically the first time an unrecognized device becomes
active. Ranges persist in `UserDefaults` under `keyboardRanges`, keyed
by CoreMIDI display name (`KeyboardProfileStore` in
`SessionCoordinator.swift`); "Skip" stores the full range `[0, 127]` so
the device is never re-prompted. `lastActiveSource` remembers the
user's pick when several sources are connected.

Degradation rules (all 48 scales are two octaves with identical roots
per key, so availability depends only on hand mode + range — see
`web/src/util/availability.ts`):

- Key-grid / hand-mode buttons that don't fit get `.btn--unavailable`
  (dimmed + line-through — deliberately not red, which would clash with
  the Right Hand button) and are disabled.
- **Cycle mode is simply unavailable** unless all 12 keys fit in the
  current hand mode — a documented limitation; there is no partial
  cycle pool. App.tsx coerces a persisted `cycle` playMode back to
  `once` when unavailable.
- If the current selection no longer fits (calibration or hand-mode
  change), the server switches to the chromatically nearest fitting key
  of the same scale type and explains in the feedback line
  (`SessionCoordinator.enforceFit`).
- The `KeyboardBar` (bottom of `PracticePanel`) shows the active
  device, its range, calibration prompts, a Recalibrate button, and a
  source picker when more than one MIDI source is connected.

MIDI events are tagged with their source display name
(`SourcedNoteEvent` in `MidiInput.swift`, via `MIDIPortConnectSource`
connRefCon).

## web/dist bundle — how it gets into the app

xcodegen's `resources: type: folder` does **not** correctly add `.xcassets`
or regular folders to the iOS compile/copy pipeline. Instead, `web/dist`
is copied by a **postBuildScript** in `project.yml`:

```bash
DEST="$BUILT_PRODUCTS_DIR/$CONTENTS_FOLDER_PATH/dist"
rm -rf "$DEST"
cp -r "$SRCROOT/web/dist" "$DEST"
```

A **preBuildScript** runs `npm run build` first. Do not remove either
script. Do not try to add `web/dist` as a folder reference instead —
it will silently fail to copy.

`web/dist` is tracked in git (unlike the Mac repo where it is gitignored)
because the Xcode build needs it present at project-generation time.

## Info.plist keys — always go in project.yml

xcodegen **regenerates `JSPiPad/Info.plist` on every `xcodegen generate`**,
overwriting any manual edits. All custom plist keys must be in the
`info.properties:` block inside `project.yml`. Never hand-edit
`JSPiPad/Info.plist` directly.

Key gotchas:
- `UIDeviceFamily` must NOT be in the plist. It is set by the build
  setting `TARGETED_DEVICE_FAMILY: "2"`. Adding it to the plist causes
  a build warning and it gets overwritten anyway.
- `UIUserInterfaceStyle: Dark` forces the whole app (including the
  `UILaunchScreen` background) to dark mode.
- **Versioning**: `CFBundleShortVersionString`/`CFBundleVersion` are
  wired to `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)` — bump
  those in `project.yml` `settings:` (the plist is regenerated).
  Increment `CURRENT_PROJECT_VERSION` on every App Store Connect upload.
- **Signing**: `DEVELOPMENT_TEAM` + `CODE_SIGN_STYLE: Automatic` live in
  `project.yml` so regeneration doesn't wipe the team set in Xcode.

## App icon

Icon lives in `Assets.xcassets/AppIcon.appiconset/`.

**PNG must be opaque RGB — no alpha channel.** iOS rejects icons with
transparency and shows a "box of circles" placeholder instead. Always
generate with `Image.new("RGB", ...)`, not `"RGBA"`.

Outstanding issue: the asset catalog may not compile correctly via
xcodegen's `resources:` path. This was fixed by moving `Assets.xcassets`
to the `sources:` block in `project.yml`, which ensures it is included
in the asset catalog compile phase.

## Persistence

Settings (like the current key) should be persisted using `UserDefaults`.

## Safe area

The WKWebView is full-screen (`ignoresSafeArea()`). Content insets are
handled in CSS using:

```css
padding: calc(Npx + env(safe-area-inset-top)) ...
```

Applied to `.sidebar` and `.practice` in `web/src/styles.css`.
`viewport-fit=cover` is already set in `web/index.html`.

## Build commands

```bash
# Regenerate Xcode project after any project.yml change
xcodegen generate

# Manually rebuild the React UI (also runs automatically in Xcode)
cd web && npm run build
```

All other building/running is done from Xcode (⌘R). The preBuildScript
runs `npm run build` automatically.

## Pushing

Remote is SSH: `git@github.com:jaynewt1959/jsp-ipad.git`.
Co-author trailer on every commit: `Co-Authored-By: Oz <oz-agent@warp.dev>`

## Out of scope (don't add without asking)

Everything in `../jsp/AGENTS.md#out-of-scope` still applies, plus:
- Migrating the WS handler off Hummingbird to a native WKWebView bridge.
- Multi-window / split-screen iPad support.
- Background MIDI (app running while screen locked).
