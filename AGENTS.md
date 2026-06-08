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

Port **8089** is hardcoded in `EngineHost.swift`; server binds to `127.0.0.1`
(not `0.0.0.0` — iPad has no "local-network server" use case).

## Key files

| File | Role |
|------|------|
| `JSPiPad/JSPiPadApp.swift` | `@main` SwiftUI entry, fires `EngineHost.shared.start()` as detached task |
| `JSPiPad/ContentView.swift` | WKWebView wrapper; polls `/healthz` then loads `http://localhost:8089/` |
| `JSPiPad/EngineHost.swift` | Starts Hummingbird, registers WS routes, finds `web/dist` in bundle |
| `Sources/Server/HTTPServer.swift` | `127.0.0.1` binding (differs from Mac which uses `0.0.0.0`) |
| `Sources/Lesson/LessonEngine.swift` | Engine-internal `EngineState` enum (NOT `LessonState` — see below) |
| `project.yml` | xcodegen spec — **source of truth** for the Xcode project |
| `Assets.xcassets/AppIcon.appiconset/` | App icon (must be opaque RGB PNG) |
| `web/src/hooks/useMetronome.ts` | Web Audio API lookahead metronome; accented downbeat on beat 1 of 4/4 |
| `web/src/hooks/useTiming.ts` | Eighth-note timing evaluation; produces per-note quality + cumulative stats |
| `web/src/hooks/useSession.ts` | WebSocket session management |
| `web/src/components/Sidebar.tsx` | All controls: Free/Timed, BPM, hand mode, scale, direction, Once/Loop/Cycle, Reset |
| `web/src/data/cycleOrders.ts` | Builds ordered scale pools for cyclic practice (random, chromatic, fifths) |
| `web/src/hooks/usePersistedSettings.ts` | Persists sidebar settings (incl. playMode, cycleOrder) to localStorage |
| `web/src/components/PracticePanel.tsx` | Main practice area: step label, keyboard strip, score, feedback, timing stats |
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
is Random (Fisher-Yates, no back-to-back duplicates) or Circle of Fifths. Scale type
(major/minor) is derived from the Scale section's Major/Nat. Minor toggle — there is
no separate cycle scale-type selector. Cycle state (pool, index) lives in refs in
`App.tsx`; settings are persisted via `usePersistedSettings`. Switching mode sends
`restartLesson` immediately.

**Reset button**: restarts the current lesson without changing any other settings.

**Analyze button**: sends `requestDebugLog` to the server. Disabled when MIDI is not running.

**Build timestamp debug bar**: thin bar at top of PracticePanel showing `__BUILD_TIME__`
(injected by Vite) and last WS command received. Intentionally left in — useful for
confirming the app on-device matches the latest build.

## Wire contract — keep two files in sync

Same contract as the Mac `jsp` repo:

- `Sources/Server/Wire.swift` — server-side types
- `web/src/types.ts` — TypeScript mirror

There is no `docs/protocol.md` in this repo; refer to `../jsp/docs/protocol.md`
if you need the field reference. Do not diverge from the Mac wire format
without a deliberate decision.

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
