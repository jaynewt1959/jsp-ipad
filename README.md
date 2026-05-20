# JSP iPad

iPad version of the JSP piano practice engine.

Embeds the same Hummingbird WebSocket server and React UI in-process.
USB MIDI keyboard connects directly to the iPad via the Apple USB-C adapter.

## Architecture

```
USB MIDI keyboard
      ↓
CoreMIDI (MidiInput.swift)
      ↓
SessionCoordinator (actor)
      ↓
Hummingbird WebSocket on localhost:8089
      ↓
WKWebView → React UI (web/dist, bundled in app)
```

## First-time Xcode setup

1. Open `JSPiPad.xcodeproj` in Xcode.
2. Select the `JSPiPad` target → **Signing & Capabilities** → set your Apple ID as the team.
3. Connect your iPad via USB. Select it as the run destination.
4. Press **Run** (⌘R). Xcode will:
   - Run the npm build script automatically (produces `web/dist`)
   - Compile Swift + Hummingbird
   - Install on your iPad

## Regenerating the Xcode project

If you edit `project.yml` (to add files, change settings etc):

```sh
xcodegen generate
```

## Mac engine (unchanged)

The original Mac CLI engine lives in the `jsp` sibling repo and is unaffected by this project.
