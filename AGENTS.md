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
xcodegen's `resources:` path. If the icon still shows as the placeholder
after a clean build, open Xcode, delete the `Assets.xcassets` reference
in the project navigator, and re-add it by dragging the folder in — this
forces Xcode to register it as an asset catalog (compile phase) rather
than a simple file copy.

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
