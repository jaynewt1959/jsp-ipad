# `web/src/score/` — sheet-music data model

This directory holds the score model used by `ScaleScoreView`.
VexFlow has been removed; the score is now a static PNG image
(`web/public/score-cmajor.png`) with an SVG highlight overlay
driven by the lesson snapshot.  The files here are kept for
`buildScoreModel` (lesson-identity check) and `midiToPitch`.

## Files

* `midiToPitch.ts` — `midiToVexFlowKey(midi)` returns a VexFlow
  pitch key like `"c/4"`.
* `model.ts` — `NoteSpec` / `ScoreModel` types and the hard-coded
  C major model that mirrors `Sources/Lesson/CMajor.swift`.
  `buildScoreModel(snapshot.lesson)` returns the model when the
  lesson shape matches; `null` otherwise.

## Adding a new lesson

When a new lesson is added to the engine (e.g. D major hands-together
ascending), do these in one commit:

1. Add the lesson constants to `Sources/Lesson/` and update the
   self-test (Swift side).
2. Add a sibling `D_MAJOR_*` constant in `model.ts` mirroring the
   engine's note + finger arrays. Pick durations and `measures` to
   match how you want the score laid out.
3. Extend `buildScoreModel` to return the new constant when
   `snapshot.lesson` matches its shape.

That's it — the rest of the rendering (`ScoreView`) is lesson-
agnostic and will pick up the new model automatically.

## What's deliberately not here

* **Audio playback** — would need a sampler / Web Audio.
* **Dotted rhythms / triplets** — not used in the v0 lesson.
  Eighth-note beaming in groups of 4 (half-bar) is already
  implemented in `ScoreView` via `Beam.generateBeams`.
* **Accidentals + key signatures other than C** — `midiToPitch.ts`
  knows the chromatic scale, but `ScoreModel.keySig` is currently
  fixed to `"C"` and ScoreView doesn't yet pass a key-signature
  hint to VexFlow's `Stave`. One-line change to add when the first
  sharp/flat key arrives.
* **Multi-system scores** — everything fits on one line for the C
  major two-octave lesson. When a longer lesson lands we'll need to
  break the score across rows.

## Why a parallel model instead of extending the wire snapshot?

The wire `Snapshot` is small and frozen for v0. Score-only metadata
(durations, time signature, bar lines) doesn't matter to the engine
and would bloat every snapshot for every connected client. We can
revisit this if we ever build a "score editor" that needs the
metadata server-side.
