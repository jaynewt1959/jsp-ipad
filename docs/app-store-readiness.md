# App Store readiness — audit & action plan

Audited 2026-06-12 against current App Review Guidelines.
Toolchain at audit time: Xcode 26.5 / iOS 26.5 SDK (meets the
April 28 2026 "built with Xcode 26 / iPadOS 26 SDK" minimum).

Status legend: ✅ done · ⬜ open

## High-risk items (were likely rejections)

✅ **Infinite spinner on engine failure (Guideline 2.1)** — fixed in `0b49c38`.
`EngineHost` is now a state machine (`idle/starting/running(port)/failed`)
with port fallback 8089→8090→8091; `ContentView` polls it with a 12 s
timeout and shows an error + Retry screen on failure.

✅ **Visible debug UI in store builds (Guideline 2.2)** — fixed in `0b49c38`.
`__DEV_TOOLS__` (set from `VITE_APP_CONFIG=$CONFIGURATION` in the Xcode
preBuildScript) compiles the build-timestamp bar, Analyze button, and
DebugPanel out of Release builds, and disables source maps. Debug builds
keep everything.

✅ **Versioning/signing wiped by xcodegen** — fixed in `0b49c38`.
`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` / `DEVELOPMENT_TEAM` /
`CODE_SIGN_STYLE` live in `project.yml`. Bump `CURRENT_PROJECT_VERSION`
on every App Store Connect upload.

✅ **Hardware dependency (Guideline 2.1) — demo mode shipped.**
The on-screen keyboard strip is tappable whenever no physical keyboard
is active (option (b): `simulateNote` wire command). The full lesson
flow — mistakes, stats, completion, Reset — works from cold launch with
zero MIDI involvement, so App Review can exercise the app without
hardware. A hint line ("No keyboard connected — tap the keys on screen
to practice") makes it discoverable.
Remaining mitigations (App Store Connect, no code):
1. **App Review notes**: a USB MIDI keyboard (via USB-C) is the primary
   input, but the app is fully testable by tapping the on-screen keys;
   include a **demo video link** showing connect → calibration → scale
   practice → completion stats. Draft + shot list ready in
   `docs/app-store-metadata.md`; video still to record.
2. App Store description should mention both: best with a USB MIDI
   keyboard, works with on-screen keys. Draft ready in
   `docs/app-store-metadata.md`.

## Medium items

⬜ **TestFlight upload early** to surface privacy-manifest warnings
(ITMS-91053). `PrivacyInfo.xcprivacy` declares UserDefaults `CA92.1`,
FileTimestamp `C617.1`, SystemBootTime `35F9.1`. SwiftNIO (statically
linked via Hummingbird) may also touch disk-space APIs — if the upload
warns, add `NSPrivacyAccessedAPICategoryDiskSpace` reason `85F4.1`.

⬜ **Landscape-only / `UIRequiresFullScreen` is on borrowed time.**
Valid today: the key exempts us from the all-four-orientations
validation rule and iPadOS 26 honors it via a compatibility mode
(scaled, non-resizable scene). But it's deprecated (TN3192) and Apple
warns all-orientation support "will soon be required". Plan portrait +
resizable-scene support in a post-launch update. SwiftUI scene
lifecycle ✅ and launch screen ✅ already satisfy the iPadOS 27
requirements announced so far.

✅ **App name** — strategy + candidates in `docs/app-store-metadata.md`:
store name "Jay's Scale Practice" (display name stays JSP), knock-out
screening checklist included. Reserve in ASC as soon as the developer
account is live.

## App Store Connect checklist (no code)

⬜ Privacy policy URL (required even with no data collection)
⬜ App Privacy questionnaire → "Data Not Collected"
⬜ iPad screenshots, 13" class (2048×2732 / 2064×2752), landscape
⬜ Age rating questionnaire (2026 revision), category (Music or
   Education), support URL, copyright
⬜ Review notes + demo video link (see hardware item above)
⬜ Archive with Release config (scheme already set), validate in
   Organizer before submitting

## Low / polish

⬜ `web/dist` ships unused images (`score-cmajor.png`, `scores/`) —
   bundle-size only.
⬜ One device pass (⌘R) to eyeball splash → error → Retry flow.

## Verified compliant — don't re-audit

- **Permissions**: USB CoreMIDI needs no usage string; no Bluetooth/
  network MIDI, mic, camera, or location; loopback-only traffic doesn't
  trigger Local Network privacy. `MidiInput.swift` is plain CoreMIDI.
- **ATS**: only `NSAllowsLocalNetworking` (for `http://localhost`).
- **Export compliance**: `ITSAppUsesNonExemptEncryption=false` correct —
  plain HTTP over loopback, no proprietary crypto.
- **Icons/launch**: 1024×1024 opaque RGB single-size icon (verified no
  alpha via `sips`); `LaunchBackground`/`LaunchIcon` assets present;
  catalog + `PrivacyInfo.xcprivacy` confirmed in the Resources phase.
- **No forbidden tech**: WKWebView (not UIWebView), no private APIs, no
  remote code — all JS bundled (2.5.2 ✅); no analytics/trackers
  (`NSPrivacyTracking=false` matches reality).
- **Minimum functionality (4.2)**: native on-device engine + bundled UI,
  not a website wrapper.
- **iPad-only**: `TARGETED_DEVICE_FAMILY=2`, landscape +
  `UIRequiresFullScreen=true` passes upload validation today (see
  medium item for the deprecation horizon).

## References

- Guidelines: 2.1 App Completeness, 2.2 Beta/demo, 2.3.7 metadata,
  2.5.2 self-contained code, 4.2 minimum functionality
- TN3192: Migrating from the deprecated `UIRequiresFullScreen` key
- Apple "Upcoming requirements": Xcode 26 / OS 26 SDK minimum since
  2026-04-28
