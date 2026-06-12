//
//  SessionCoordinator.swift
//  jsp-engine
//
//  The "brain" of the engine. Owns the MIDI input, the lesson engine,
//  and the rolling UI snapshot. Consumes note events, applies them to
//  `LessonEngine`, mutates the snapshot, and broadcasts the new
//  snapshot to every connected WebSocket client via the hub.
//
//  Implemented as an actor so all state mutations are serialized
//  without explicit locks. CoreMIDI events arrive on the MidiInput's
//  thread but are funneled through an `AsyncStream` and consumed by a
//  dedicated `Task` that hops back into the actor for each event.
//
import Foundation

actor SessionCoordinator {

    // MARK: - Hand mode

    /// Which hands the player is currently required to use.
    private enum HandMode: String {
        case together
        case leftOnly
        case rightOnly
    }

    // MARK: - Dependencies

    private let hub: WebSocketHub
    private let midi: MidiInput

    // MARK: - State

    private var currentKey: KeySignature = .cMajor
    private var currentDirection: Direction = .ascendingDescending
    private var lesson: ScaleLesson = ScaleLibrary.lesson(key: .cMajor, direction: .ascendingDescending)
    private let engine: LessonEngine
    private var handMode: HandMode = .together

    // Metronome
    private var metronomeEnabled: Bool = false
    private var metronomeBpm: Int = 80

    private var leftStatus: WireHandStatus = .idle
    private var rightStatus: WireHandStatus = .idle
    private var feedback: String = ""
    private var mistakesByStep: [Int: Int] = [:]
    private var lessonStartedAt: Date?
    private var lessonFinishedAt: Date?
    /// Unix-epoch ms captured on each rewind — sent to the client as the
    /// beat-grid anchor so the client metronome stays in phase.
    private var lessonStartMs: Int64 = 0
    /// Unix-epoch ms of the most recent correct note-on — used by the
    /// client to evaluate timing against its own beat grid.
    private var lastNoteOnMs: Int64? = nil
    /// Step index used by the score highlight overlay.
    private var displayStepIndex: Int = 0
    /// Count of stale-note precision demerits since the last rewind.
    /// Incremented when a hand presses step N while still physically
    /// holding the note from step N-2 (one-step overlap is valid legato;
    /// two-step overlap is imprecise technique).
    private var stalenessCount: Int = 0

    // MARK: - Stale-note tracker

    /// Tracks the two most recent correct notes for one hand to detect
    /// stale-note precision demerits.  A demerit is counted when the
    /// note from N-2 steps is still physically held when N is pressed.
    private struct StaleNoteTracker {
        var prevNote: Int? = nil     // note pressed at step N-2
        var currentNote: Int? = nil  // note pressed at step N-1

        /// Call when the hand correctly presses `newNote`.
        /// Returns `true` if the note from two steps ago is still held.
        /// `prevNote == newNote` is always false-positive: a piano key
        /// must be released before it can be re-pressed, so the note
        /// can only be in `heldNotes` because we just inserted it.
        mutating func advance(newNote: Int, heldNotes: Set<Int>) -> Bool {
            let stale = prevNote.map { $0 != newNote && heldNotes.contains($0) } ?? false
            prevNote = currentNote
            currentNote = newNote
            return stale
        }

        mutating func reset() {
            prevNote = nil
            currentNote = nil
        }
    }

    private var leftStaleTracker  = StaleNoteTracker()
    private var rightStaleTracker = StaleNoteTracker()
    /// Event-clock ms of the first hand's correct note-on on the current
    /// step (derived from `NoteEvent.timestampNs`), if available.
    private var firstHandArrivedEventMs: Int64? = nil
    /// Wall-clock fallback (unix-epoch ms) captured alongside
    /// `firstHandArrivedEventMs`, used when event-clock data is missing.
    private var firstHandArrivedWallMs: Int64? = nil
    /// Running total and count for the average sync metric.
    private var syncTotalMs: Double = 0
    private var syncCount: Int = 0
    private var syncMinMs: Double? = nil
    private var syncMaxMs: Double? = nil
    private var syncWorstStep: Int? = nil
    private var correctVelocities: [Double] = []
    /// Wall-clock ms timestamps of each correct note-on for the active hand.
    /// Used to compute inter-onset interval CV (rhythm metric).
    private var correctNoteOnMs: [Double] = []
    /// Fixed-velocity detection (per run). Non-touch-sensitive keyboards
    /// send a constant velocity for every note-on, which makes
    /// `velocityCV()` meaninglessly ~0 ("perfect" evenness). Track every
    /// note-on velocity; if ≥8 arrive without a single distinct value,
    /// treat velocity data as unavailable and suppress the stat.
    private var firstNoteOnVelocity: Int? = nil
    private var sawDistinctVelocity: Bool = false
    private var noteOnCount: Int = 0
    private var midiTask: Task<Void, Never>?
    /// Notes currently held down. Used by the stale-note tracker to
    /// detect when a note from N-2 steps is still physically held.
    private var heldNotes: Set<Int> = []
    /// Bounded ring-buffer of MIDI events + their engine results.
    /// Always on; reset at each lesson rewind.
    private var eventLog = EventLog()

    // MARK: - Keyboard profiles & calibration

    /// Phases of the 2-press range calibration.
    private enum CalibrationPhase: String {
        case idle
        case awaitingLow
        case awaitingHigh
    }

    private let profiles = KeyboardProfileStore()
    /// Display name of the MIDI source whose events drive the lesson.
    /// Events from other connected sources are ignored.
    private var activeSource: String? = nil
    /// Physical range of the active keyboard. nil = unknown or
    /// full-size (no restriction).
    private var activeRange: KeyboardRange? = nil
    private var calibration: CalibrationPhase = .idle
    private var calibrationLow: Int? = nil

    // MARK: - Init

    init(hub: WebSocketHub, midi: MidiInput) {
        self.hub = hub
        self.midi = midi
        self.engine = LessonEngine()
        self.engine.start(lesson: lesson)
        self.lessonStartedAt = Date()
    }

    // MARK: - External commands

    /// Feedback shown when Connect MIDI is pressed with no device
    /// plugged in. Cleared automatically when a source appears.
    private static let noDeviceFeedback =
        "No MIDI device detected — plug in a keyboard, or tap the keys on screen"

    /// Start CoreMIDI and (re)start the lesson. Idempotent w.r.t. the
    /// MIDI side; rewinds the lesson regardless — connecting MIDI
    /// always begins a fresh practice session.
    func handleStart() async {
        midi.setSourcesChangedHandler { [weak self] in
            guard let self else { return }
            Task { await self.handleSourcesChanged() }
        }
        midi.start()
        beginConsumingMidiIfNeeded()
        // The input device is changing: stale holds (e.g. an on-screen
        // tap mid-press) can never deliver their note-off through the
        // new input, so drop them.
        heldNotes.removeAll()
        rewindLesson()
        reconcileActiveSource()
        // Connecting with nothing plugged in otherwise looks like a
        // no-op — tell the user. Covers both "CoreMIDI started with
        // zero sources" and "client creation failed" (observed as
        // MIDIClientCreateWithBlock error -2 on device when no MIDI
        // hardware is attached): either way the source list is empty.
        // Tapping Connect again retries — midi.start() is idempotent
        // and re-attempts client creation after a failure.
        if midi.currentSourceNames().isEmpty {
            feedback = Self.noDeviceFeedback
        }
        await broadcast()
    }

    /// CoreMIDI sources appeared or disappeared (hot-plug).
    func handleSourcesChanged() async {
        reconcileActiveSource()
        // A keyboard arrived after a no-device Connect — retire the notice.
        if feedback == Self.noDeviceFeedback, !midi.currentSourceNames().isEmpty {
            feedback = ""
        }
        await broadcast()
    }

    /// Switch which connected MIDI source drives the lesson.
    func handleSetActiveSource(_ name: String) async {
        guard midi.currentSourceNames().contains(name), name != activeSource else { return }
        activeSource = name
        profiles.setLastActiveSource(name)
        rewindLesson()
        applyProfileForActiveSource(deviceChanged: true)
        await broadcast()
    }

    /// Begin (or redo) the 2-press range calibration for the active device.
    func handleStartCalibration() async {
        guard activeSource != nil, midi.isRunning() else { return }
        calibration = .awaitingLow
        calibrationLow = nil
        await broadcast()
    }

    /// Abort calibration, keeping whatever profile was already stored.
    func handleCancelCalibration() async {
        calibration = .idle
        calibrationLow = nil
        await broadcast()
    }

    /// Skip calibration: store the full range so this device is never
    /// re-prompted, and lift all restrictions.
    func handleSkipCalibration() async {
        calibration = .idle
        calibrationLow = nil
        if let name = activeSource {
            profiles.setRange(KeyboardRange(low: 0, high: 127), for: name)
        }
        activeRange = nil
        await broadcast()
    }

    /// Reset the lesson to step 0 without touching MIDI.
    /// When `clearHistory` is true (manual Reset button), also discard
    /// the previous run's event log so Analyze starts clean.
    func handleRestart(clearHistory: Bool = false) async {
        rewindLesson()
        if clearHistory { eventLog.clearAll() }
        await broadcast()
    }

    /// Update metronome settings.
    func handleSetMetronome(enabled: Bool, bpm: Int) async {
        metronomeEnabled = enabled
        metronomeBpm = max(40, min(200, bpm))
        await broadcast()
    }

    /// Switch to a different scale key and rewind the lesson.
    func handleSetScale(_ raw: String) async {
        guard let key = KeySignature(rawValue: raw) else { return }
        currentKey = key
        lesson = ScaleLibrary.lesson(key: currentKey, direction: currentDirection)
        rewindLesson()
        enforceFit()
        await broadcast()
    }

    /// Switch the practice direction (ascending / descending / both) and rewind.
    func handleSetDirection(_ raw: String) async {
        guard let dir = Direction(rawValue: raw) else { return }
        currentDirection = dir
        lesson = ScaleLibrary.lesson(key: currentKey, direction: currentDirection)
        rewindLesson()
        await broadcast()
    }

    /// Switch the active hand mode and rewind the lesson.
    func handleSetHandMode(_ raw: String) async {
        handMode = HandMode(rawValue: raw) ?? .together
        rewindLesson()
        enforceFit()
        await broadcast()
    }

    /// Stop receiving MIDI events and reset the practice session —
    /// disconnecting (like connecting) always begins a fresh run, so
    /// demo-mode taps resume cleanly even if the previous run had
    /// completed (completed lessons ignore all input until a rewind).
    /// Completion stats stay visible client-side via the latched
    /// display until the next note.
    func handleStopMidi() async {
        midi.stop()
        midiTask?.cancel()
        midiTask = nil
        // The physical keyboard is gone: held keys can never deliver
        // their note-offs, and the device-specific state (active
        // source, range, calibration) no longer applies. Clearing the
        // active source is also what re-enables on-screen taps.
        heldNotes.removeAll()
        reconcileActiveSource()
        rewindLesson()
        await broadcast()
    }

    /// Send the current snapshot to every connected client. Useful
    /// when a fresh client first arrives.
    func broadcastInitialSnapshot() async {
        await broadcast()
    }

    // MARK: - Internals

    private func beginConsumingMidiIfNeeded() {
        guard midiTask == nil else { return }
        let stream = midi.events()
        midiTask = Task { [weak self] in
            for await event in stream {
                guard let self else { break }
                await self.handleNoteEvent(event)
            }
        }
    }

    // MARK: - Single-hand lesson filtering

    /// Returns a version of `lesson` where inactive-hand notes are nil
    /// so the engine advances on the active hand alone.  In .together
    /// mode the full lesson is returned unchanged.
    ///
    /// Nulling the inactive hand's notes makes `ScaleStep.requires(_:)`
    /// return false for that hand, which means `shouldAdvance()` never
    /// waits for it — no synthetic injection needed.
    private func filteredLesson(for mode: HandMode) -> ScaleLesson {
        switch mode {
        case .together:
            return lesson
        case .leftOnly:
            let steps = lesson.steps.map {
                ScaleStep(
                    leftNote:   $0.leftNote,  leftFinger:  $0.leftFinger,
                    rightNote:  nil,          rightFinger: nil,
                    waitForBothHands: false
                )
            }
            return ScaleLesson(key: lesson.key, direction: lesson.direction,
                               handsMode: .leftOnly,  steps: steps)
        case .rightOnly:
            let steps = lesson.steps.map {
                ScaleStep(
                    leftNote:   nil,          leftFinger:  nil,
                    rightNote:  $0.rightNote, rightFinger: $0.rightFinger,
                    waitForBothHands: false
                )
            }
            return ScaleLesson(key: lesson.key, direction: lesson.direction,
                               handsMode: .rightOnly, steps: steps)
        }
    }

    private func handleNoteEvent(_ sourced: SourcedNoteEvent) async {
        // Ignore events from sources other than the active keyboard.
        if activeSource == nil { reconcileActiveSource() }
        guard sourced.sourceName == activeSource else { return }
        let event = sourced.event

        // During calibration, note-ons set the range and never reach
        // the engine.
        if calibration != .idle {
            if event.isOn && event.velocity > 0 {
                handleCalibrationPress(note: event.note)
                await broadcast()
            }
            return
        }

        await process(event)
    }

    /// Velocity attached to on-screen key taps. Constant, so the
    /// existing fixed-velocity detection latches and suppresses the
    /// evenness stat — taps carry no dynamics.
    private static let simulatedVelocity = 80

    /// A tap from the web UI's on-screen keyboard (`simulateNote`
    /// command). Only honored while no physical keyboard is driving
    /// the lesson; feeds the exact same pipeline as real MIDI so
    /// mistakes, stats, legato, and the event log behave identically.
    func handleSimulateNote(note: Int, isOn: Bool) async {
        let t0 = DispatchTime.now()
        // A physical keyboard owns the lesson — ignore taps. (This
        // also guarantees calibration is idle: calibration only runs
        // while a physical source is active.)
        guard !(midi.isRunning() && activeSource != nil) else { return }
        guard (0...127).contains(note) else { return }

        // First input after launch: anchor the run's clock the way
        // Connect MIDI / Reset would have, so elapsed time and the
        // metronome beat grid don't count from app boot.
        if isOn && lessonStartMs == 0 { rewindLesson() }

        let event = NoteEvent(
            note: note,
            velocity: isOn ? Self.simulatedVelocity : 0,
            isOn: isOn,
            timestampNs: 0  // sync metrics use the wall-clock fallback
        )
        await process(event)

        // Diagnostic: surface slow tap handling (seen as a delayed
        // next-key highlight). Normal handling is well under 5 ms.
        let ms = Double(DispatchTime.now().uptimeNanoseconds - t0.uptimeNanoseconds) / 1_000_000
        if ms >= 20 {
            NSLog("SessionCoordinator: simulateNote(%ld) took %.0f ms", note, ms)
        }
    }

    /// Shared pipeline for real and simulated note events: held-note
    /// tracking, engine processing, event log, stats, broadcast.
    private func process(_ event: NoteEvent) async {
        // Track which notes are physically held down.
        // Note-offs update heldNotes but produce no engine results and
        // no broadcast — they are only relevant to stale-note detection.
        if event.isOn && event.velocity > 0 {
            heldNotes.insert(event.note)
            trackVelocity(event.velocity)
        } else {
            heldNotes.remove(event.note)
        }

        let stepBefore = engine.currentStepIndex
        let ms = lessonStartedAt.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0

        // After completion all MIDI is silently ignored.  Only the
        // sidebar Restart button (handleRestart) can rewind the lesson.
        if engine.currentStepIndex >= lesson.steps.count { return }

        let results = engine.process(event)
        eventLog.append(LogEntry(
            ms: ms, note: event.note, velocity: event.velocity,
            isOn: event.isOn, stepIndex: stepBefore,
            results: results.map { stringifyResult($0) },
            triggeredRestart: false
        ))

        // Note-offs return [] from the engine; no state to update.
        guard !results.isEmpty else { return }

        let eventTimestampMs = event.timestampNs > 0
            ? Int64(event.timestampNs / 1_000_000)
            : nil
        for r in results { applyResult(r, eventTimestampMs: eventTimestampMs, velocity: event.velocity) }

        await broadcast()
    }

    /// Broadcast the current event log to all connected clients.
    func handleRequestDebugLog() async {
        let msg = DebugLogMessage(entries: eventLog.all)
        let encoder = JSONEncoder()
        encoder.outputFormatting = []
        do {
            let data = try encoder.encode(msg)
            if let str = String(data: data, encoding: .utf8) {
                await hub.broadcast(str)
            }
        } catch {
            FileHandle.standardError.write(
                Data("debugLog encode failed: \(error)\n".utf8)
            )
        }
    }

    private func applyResult(_ result: StepResult, eventTimestampMs: Int64?, velocity: Int) {
        switch result {
        case .lessonNotStarted:
            feedback = "Press Start to begin the lesson."

        case .correct(let hand, let stepIndex):
            setStatus(.correct, for: hand)
            if !isPartnerHand(hand) {
                let nowWallMs = Int64(Date().timeIntervalSince1970 * 1000)
                displayStepIndex = stepIndex

                // Stale-note precision check: demerit if the note from
                // two steps ago is still physically held right now.
                let expectedNote = lesson.steps[stepIndex].expectedNote(for: hand)!
                let isStale: Bool
                switch hand {
                case .left:  isStale = leftStaleTracker.advance(newNote: expectedNote, heldNotes: heldNotes)
                case .right: isStale = rightStaleTracker.advance(newNote: expectedNote, heldNotes: heldNotes)
                }
                if isStale { stalenessCount += 1 }

                // Sync tracking: measure gap between the two hands in together mode.
                if handMode == .together {
                    if let firstWallMs = firstHandArrivedWallMs {
                        // Second hand arrived — compute sync gap, but do NOT
                        // update lastNoteOnMs / correctNoteOnMs / velocity again.
                        // Timing and rhythm stats should count once per step,
                        // using the first hand's arrival (closest to the beat).
                        let delta = SyncMetrics.handSyncGapMs(
                            firstEventMs: firstHandArrivedEventMs,
                            secondEventMs: eventTimestampMs,
                            firstWallMs: firstWallMs,
                            secondWallMs: nowWallMs
                        )
                        syncTotalMs += delta
                        syncCount   += 1
                        if syncMinMs == nil || delta < syncMinMs! { syncMinMs = delta }
                        if syncMaxMs == nil || delta > syncMaxMs! {
                            syncMaxMs = delta
                            syncWorstStep = stepIndex
                        }
                        firstHandArrivedEventMs = nil
                        firstHandArrivedWallMs = nil
                    } else {
                        // First hand arrived — record timing/rhythm/velocity
                        // data once for this step.
                        lastNoteOnMs = nowWallMs
                        correctVelocities.append(Double(velocity))
                        correctNoteOnMs.append(Date().timeIntervalSince1970 * 1000)
                        firstHandArrivedEventMs = eventTimestampMs
                        firstHandArrivedWallMs = nowWallMs
                    }
                } else {
                    // Single-hand mode — record normally.
                    lastNoteOnMs = nowWallMs
                    correctVelocities.append(Double(velocity))
                    correctNoteOnMs.append(Date().timeIntervalSince1970 * 1000)
                }
            }
            guard !isPartnerHand(hand) else { break }
            let noteStr = engine.currentStep
                .flatMap { $0.expectedNote(for: hand) }
                .map    { noteName($0) } ?? label(hand)
            feedback = "\u{2713} \(noteStr)"

        case .wrongNote(let hand, let stepIndex, _, let played):
            setStatus(.wrong(played: played), for: hand)
            guard !isPartnerHand(hand) else { break }
            feedback = "\u{2717} \(label(hand)) played \(noteName(played)) — try again"
            mistakesByStep[stepIndex, default: 0] += 1

        case .handNotRequired(let hand, _):
            guard !isPartnerHand(hand) else { break }
            feedback = "\(label(hand)) hand isn't expected at this step"

        case .advanced(let toStepIndex):
            leftStatus = .idle
            rightStatus = .idle
            firstHandArrivedEventMs = nil  // safety reset for the new step
            firstHandArrivedWallMs = nil   // safety reset for the new step
            if toStepIndex != nil {
                feedback = "" // header already shows next note; no step counter needed
            } else {
                lessonFinishedAt = Date()
                feedback = "Lesson complete"
            }
        }
    }

    // MARK: - Active source, calibration, and range fit

    /// Re-evaluate which connected source should be active and apply
    /// its stored profile (or start calibration for unknown devices).
    private func reconcileActiveSource() {
        let sources = midi.currentSourceNames()
        let previous = activeSource
        if sources.isEmpty {
            activeSource = nil
        } else if let current = activeSource, sources.contains(current) {
            // Keep the current selection.
        } else if sources.count == 1 {
            activeSource = sources[0]
        } else if let last = profiles.lastActiveSource, sources.contains(last) {
            activeSource = last
        } else {
            activeSource = sources[0]
        }
        applyProfileForActiveSource(deviceChanged: activeSource != previous)
    }

    /// Apply the stored range for the active device, or enter
    /// calibration when the device is unknown. An in-progress
    /// calibration on the same device is left untouched.
    private func applyProfileForActiveSource(deviceChanged: Bool) {
        guard let name = activeSource else {
            activeRange = nil
            calibration = .idle
            calibrationLow = nil
            return
        }
        if let stored = profiles.range(for: name) {
            if deviceChanged {
                calibration = .idle
                calibrationLow = nil
                activeRange = stored.isFull ? nil : stored
                enforceFit()
            } else if calibration == .idle {
                activeRange = stored.isFull ? nil : stored
            }
        } else {
            activeRange = nil
            if deviceChanged || calibration == .idle {
                calibration = .awaitingLow
                calibrationLow = nil
            }
        }
    }

    /// One calibration key press: first sets the low end, second the
    /// high end (swapped if reversed; ignored if identical).
    private func handleCalibrationPress(note: Int) {
        switch calibration {
        case .awaitingLow:
            calibrationLow = note
            calibration = .awaitingHigh
        case .awaitingHigh:
            guard let low = calibrationLow else {
                calibration = .awaitingLow
                return
            }
            guard note != low else { return }
            finishCalibration(with: KeyboardRange(low: min(low, note), high: max(low, note)))
        case .idle:
            break
        }
    }

    private func finishCalibration(with range: KeyboardRange) {
        calibration = .idle
        calibrationLow = nil
        if let name = activeSource {
            profiles.setRange(range, for: name)
        }
        activeRange = range.isFull ? nil : range
        rewindLesson()
        enforceFit()
    }

    /// Min/max MIDI note the current hand mode requires for `key`.
    private func lessonSpan(for key: KeySignature) -> (low: Int, high: Int)? {
        let l = ScaleLibrary.lesson(key: key, direction: currentDirection)
        var notes: [Int] = []
        for step in l.steps {
            if handMode != .rightOnly, let n = step.leftNote { notes.append(n) }
            if handMode != .leftOnly, let n = step.rightNote { notes.append(n) }
        }
        guard let lo = notes.min(), let hi = notes.max() else { return nil }
        return (lo, hi)
    }

    private func fits(_ key: KeySignature, in range: KeyboardRange) -> Bool {
        guard let span = lessonSpan(for: key) else { return true }
        return span.low >= range.low && span.high <= range.high
    }

    /// Keys sharing the scale type (major / natural / harmonic / melodic).
    private func sameTypeKeys(as key: KeySignature) -> [KeySignature] {
        let raw = key.rawValue
        let suffix: String
        if raw.hasSuffix("NaturalMinor") { suffix = "NaturalMinor" }
        else if raw.hasSuffix("HarmonicMinor") { suffix = "HarmonicMinor" }
        else if raw.hasSuffix("MelodicMinor") { suffix = "MelodicMinor" }
        else { suffix = "Major" }
        return KeySignature.allCases.filter { $0.rawValue.hasSuffix(suffix) }
    }

    /// The fitting key of the same type chromatically closest to `key`.
    private func nearestFittingKey(to key: KeySignature, in range: KeyboardRange) -> KeySignature? {
        guard let currentSpan = lessonSpan(for: key) else { return nil }
        return sameTypeKeys(as: key)
            .filter { $0 != key && fits($0, in: range) }
            .compactMap { k -> (KeySignature, Int)? in
                guard let s = lessonSpan(for: k) else { return nil }
                return (k, abs(s.low - currentSpan.low))
            }
            .min { $0.1 < $1.1 }?
            .0
    }

    /// If the current key doesn't fit the active range for the current
    /// hand mode, switch to the nearest fitting key of the same type,
    /// rewind, and explain in the feedback line. Call after
    /// `rewindLesson()` so the notice survives the rewind's feedback
    /// reset.
    private func enforceFit() {
        guard let range = activeRange else { return }
        if fits(currentKey, in: range) { return }
        let unfitName = keyDisplayName(currentKey)
        guard let replacement = nearestFittingKey(to: currentKey, in: range) else {
            feedback = "No \(handModeLabel) scale fits this keyboard"
            return
        }
        currentKey = replacement
        lesson = ScaleLibrary.lesson(key: currentKey, direction: currentDirection)
        rewindLesson()
        feedback = "\(unfitName) doesn't fit this keyboard — switched to \(keyDisplayName(replacement))"
    }

    private var handModeLabel: String {
        switch handMode {
        case .together:  return "both-hands"
        case .leftOnly:  return "left-hand"
        case .rightOnly: return "right-hand"
        }
    }

    /// Human-readable key name, e.g. "C\u{266F} Major", "A\u{266D} Natural Minor".
    private func keyDisplayName(_ key: KeySignature) -> String {
        let raw = key.rawValue
        let roots: [(String, String)] = [
            ("cSharp", "C\u{266F}"), ("fSharp", "F\u{266F}"),
            ("eb", "E\u{266D}"), ("ab", "A\u{266D}"), ("bb", "B\u{266D}"),
            ("c", "C"), ("d", "D"), ("e", "E"), ("f", "F"),
            ("g", "G"), ("a", "A"), ("b", "B"),
        ]
        for (prefix, label) in roots where raw.hasPrefix(prefix) {
            let rest = raw.dropFirst(prefix.count)
            let type = rest.hasPrefix("Major") ? "Major"
                : rest.hasPrefix("NaturalMinor") ? "Natural Minor"
                : rest.hasPrefix("HarmonicMinor") ? "Harmonic Minor"
                : "Melodic Minor"
            return "\(label) \(type)"
        }
        return raw
    }

    private func rewindLesson() {
        eventLog.reset()
        engine.start(lesson: filteredLesson(for: handMode))
        leftStatus = .idle
        rightStatus = .idle
        feedback = ""
        mistakesByStep = [:]
        displayStepIndex = 0
        stalenessCount = 0
        leftStaleTracker.reset()
        rightStaleTracker.reset()
        firstHandArrivedEventMs = nil
        firstHandArrivedWallMs = nil
        syncTotalMs = 0
        syncCount = 0
        syncMinMs = nil
        syncMaxMs = nil
        syncWorstStep = nil
        correctVelocities = []
        correctNoteOnMs = []
        firstNoteOnVelocity = nil
        sawDistinctVelocity = false
        noteOnCount = 0
        let now = Date()
        lessonStartedAt = now
        lessonFinishedAt = nil
        let nowMs = Int64(now.timeIntervalSince1970 * 1000)
        lessonStartMs = nowMs
        lastNoteOnMs = nil
    }

    // MARK: - Snapshot construction

    private func makeSnapshot() -> Snapshot {
        let stepIndex = engine.currentStepIndex
        let isCompleted = stepIndex >= lesson.steps.count
        let currentStep = engine.currentStep.map(StepState.init)

        let mistakesByStepWire = Dictionary(
            uniqueKeysWithValues: mistakesByStep.map { (String($0.key), $0.value) }
        )

        let elapsed: Double? = lessonStartedAt.map { start in
            (lessonFinishedAt ?? Date()).timeIntervalSince(start)
        }

        return Snapshot(
            midi: MidiState(
                running: midi.isRunning(),
                sources: midi.currentSourceNames(),
                activeSource: activeSource
            ),
            lesson: LessonState(
                key: lesson.key.rawValue,
                direction: lesson.direction.rawValue,
                handsMode: handMode.rawValue,
                totalSteps: lesson.steps.count,
                currentStepIndex: isCompleted ? lesson.steps.count : stepIndex,
                isCompleted: isCompleted,
                currentStep: currentStep,
                lessonStartMs: lessonStartMs,
                lastNoteOnMs: lastNoteOnMs,
                displayStepIndex: displayStepIndex,
                stalenessCount: stalenessCount,
                avgSyncMs: syncCount > 0 ? syncTotalMs / Double(syncCount) : nil,
                minSyncMs: syncMinMs,
                maxSyncMs: syncMaxMs,
                worstSyncStep: syncWorstStep,
                velocityCV: fixedVelocityDetected ? nil : velocityCV(),
                rhythmCV: rhythmCV(),
                fixedVelocity: fixedVelocityDetected
            ),
            handStatus: HandStatusPair(left: leftStatus, right: rightStatus),
            feedback: feedback,
            mistakesByStep: mistakesByStepWire,
            elapsedSec: elapsed,
            serverTimeMs: Int64(Date().timeIntervalSince1970 * 1000),
            metronome: MetronomeState(enabled: metronomeEnabled, bpm: metronomeBpm),
            keyboard: KeyboardState(
                rangeLow: activeRange?.low,
                rangeHigh: activeRange?.high,
                calibration: calibration.rawValue
            )
        )
    }

    private func broadcast() async {
        let snap = makeSnapshot()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [] // compact
        do {
            let data = try encoder.encode(snap)
            if let str = String(data: data, encoding: .utf8) {
                await hub.broadcast(str)
            }
        } catch {
            FileHandle.standardError.write(
                Data("snapshot encode failed: \(error)\n".utf8)
            )
        }
    }

    // MARK: - Result serialisation

    /// Encode a `StepResult` as a compact colon-delimited string.
    /// Format: kind:hand:step[:extra…]
    ///   correct:left:0
    ///   wrong:left:3:50:48       (expected:played)
    ///   notRequired:left:7
    ///   advanced:4   or   advanced:done
    ///   lessonNotStarted
    private func stringifyResult(_ result: StepResult) -> String {
        switch result {
        case .correct(let hand, let step):
            return "correct:\(hand.rawValue):\(step)"
        case .wrongNote(let hand, let step, let expected, let played):
            return "wrong:\(hand.rawValue):\(step):\(expected):\(played)"
        case .handNotRequired(let hand, let step):
            return "notRequired:\(hand.rawValue):\(step)"
        case .advanced(let to):
            return "advanced:\(to.map(String.init) ?? "done")"
        case .lessonNotStarted:
            return "lessonNotStarted"
        }
    }

    /// True when `hand` is the partner (auto-satisfied) hand in the
    /// current single-hand mode, i.e. its results should not surface
    /// as user-visible feedback.
    private func isPartnerHand(_ hand: HandSide) -> Bool {
        switch handMode {
        case .together:  return false
        case .leftOnly:  return hand == .right
        case .rightOnly: return hand == .left
        }
    }

    // MARK: - Helpers

    private func setStatus(_ status: WireHandStatus, for hand: HandSide) {
        switch hand {
        case .left:  leftStatus = status
        case .right: rightStatus = status
        }
    }

    private func other(_ hand: HandSide) -> HandSide {
        hand == .left ? .right : .left
    }

    private func label(_ hand: HandSide) -> String {
        hand == .left ? "Left" : "Right"
    }

    /// CV of inter-onset intervals (IOIs) between consecutive correct notes.
    /// Lower = more rhythmically even. nil until ≥3 correct notes (≥2 IOIs).
    private func rhythmCV() -> Double? {
        guard correctNoteOnMs.count >= 3 else { return nil }
        var iois: [Double] = []
        for i in 1..<correctNoteOnMs.count {
            iois.append(correctNoteOnMs[i] - correctNoteOnMs[i - 1])
        }
        let n = Double(iois.count)
        let mean = iois.reduce(0, +) / n
        guard mean > 0 else { return nil }
        let variance = iois.reduce(0.0) { $0 + ($1 - mean) * ($1 - mean) } / n
        return sqrt(variance) / mean * 100
    }

    /// True when every note-on this run carried the same velocity — the
    /// signature of a keyboard without touch response (or with Touch
    /// Response set to Off). Requires a minimum sample count so the
    /// first few notes of a run can't trigger it; one distinct value
    /// latches `sawDistinctVelocity` and clears the flag for the run.
    private var fixedVelocityDetected: Bool {
        noteOnCount >= Self.fixedVelocityMinSamples && !sawDistinctVelocity
    }
    private static let fixedVelocityMinSamples = 8

    /// Feed one note-on velocity into fixed-velocity detection.
    /// Counts wrong notes too — more samples, faster detection.
    private func trackVelocity(_ velocity: Int) {
        noteOnCount += 1
        if let first = firstNoteOnVelocity {
            if velocity != first { sawDistinctVelocity = true }
        } else {
            firstNoteOnVelocity = velocity
        }
    }

    private func velocityCV() -> Double? {
        let n = correctVelocities.count
        guard n >= 2 else { return nil }
        let mean = correctVelocities.reduce(0, +) / Double(n)
        guard mean > 0 else { return nil }
        let variance = correctVelocities.reduce(0.0) { $0 + ($1 - mean) * ($1 - mean) } / Double(n)
        return sqrt(variance) / mean * 100
    }

    /// True when the active key uses flat spellings (F major, Bb major, etc.).
    private var useFlats: Bool {
        switch currentKey {
        case .fMajor, .bbMajor, .ebMajor, .abMajor,
             .dNaturalMinor, .gNaturalMinor, .cNaturalMinor,
             .fNaturalMinor, .bbNaturalMinor, .ebNaturalMinor, .abNaturalMinor:
            return true
        default:
            return false
        }
    }

    private func noteName(_ midi: Int) -> String {
        let sharps = ["C", "C\u{266F}", "D", "D\u{266F}", "E", "F", "F\u{266F}", "G", "G\u{266F}", "A", "A\u{266F}", "B"]
        let flats  = ["C", "D\u{266D}", "D", "E\u{266D}", "E", "F", "G\u{266D}", "G", "A\u{266D}", "A", "B\u{266D}", "B"]
        let names  = useFlats ? flats : sharps
        let octave = (midi / 12) - 1
        let pitch  = names[((midi % 12) + 12) % 12]
        return "\(pitch)\(octave)"
    }
}

// MARK: - Keyboard range & profile store

/// Physical key range of a keyboard, in MIDI note numbers.
struct KeyboardRange: Equatable {
    let low: Int
    let high: Int
    /// True when the stored range imposes no restriction.
    var isFull: Bool { low <= 0 && high >= 127 }
}

/// UserDefaults-backed per-device key ranges, keyed by the CoreMIDI
/// display name, plus the last user-selected active source. A "Skip"
/// during calibration stores the full range [0, 127] so known devices
/// are never re-prompted.
struct KeyboardProfileStore {
    private let rangesKey = "keyboardRanges"
    private let lastActiveKey = "lastActiveSource"

    func range(for device: String) -> KeyboardRange? {
        guard let dict = UserDefaults.standard.dictionary(forKey: rangesKey) as? [String: [Int]],
              let pair = dict[device], pair.count == 2
        else { return nil }
        return KeyboardRange(low: pair[0], high: pair[1])
    }

    func setRange(_ range: KeyboardRange, for device: String) {
        var dict = (UserDefaults.standard.dictionary(forKey: rangesKey) as? [String: [Int]]) ?? [:]
        dict[device] = [range.low, range.high]
        UserDefaults.standard.set(dict, forKey: rangesKey)
    }

    var lastActiveSource: String? {
        UserDefaults.standard.string(forKey: lastActiveKey)
    }

    func setLastActiveSource(_ name: String) {
        UserDefaults.standard.set(name, forKey: lastActiveKey)
    }
}
