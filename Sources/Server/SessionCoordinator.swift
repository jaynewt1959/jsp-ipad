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
    /// Step index used by the score highlight overlay.  Advances on
    /// `.legatoPrepress` as well as `.advanced` so the green ellipse
    /// jumps to the pre-pressed note immediately.
    private var displayStepIndex: Int = 0
    /// Count of `.alreadySatisfied` results for the active hand since
    /// the last rewind.  Used to compute accuracy alongside wrong-note
    /// mistakes: zero skips + zero mistakes = 100 %.
    private var alreadySatisfiedCount: Int = 0
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
    /// Notes currently held down. Used for legato synthesis (detecting
    /// when the next step's note is already physically held as the
    /// previous step advances).
    private var heldNotes: Set<Int> = []
    /// Bounded ring-buffer of MIDI events + their engine results.
    /// Always on; reset at each lesson rewind.
    private var eventLog = EventLog()

    // MARK: - Init

    init(hub: WebSocketHub, midi: MidiInput) {
        self.hub = hub
        self.midi = midi
        self.engine = LessonEngine()
        self.engine.start(lesson: lesson)
        self.lessonStartedAt = Date()
    }

    // MARK: - External commands

    /// Start CoreMIDI and (re)start the lesson. Idempotent w.r.t. the
    /// MIDI side; rewinds the lesson regardless.
    func handleStart() async {
        midi.start()
        beginConsumingMidiIfNeeded()
        rewindLesson()
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
        await broadcast()
    }

    /// Stop receiving MIDI events. Lesson state is preserved so the
    /// user can review results.
    func handleStopMidi() async {
        midi.stop()
        midiTask?.cancel()
        midiTask = nil
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

    private func handleNoteEvent(_ event: NoteEvent) async {
        // Track which notes are physically held down.
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

        // Process
        // every result (including empty — stray note-offs are still
        // diagnostic).
        let results = engine.process(event)
        eventLog.append(LogEntry(
            ms: ms, note: event.note, velocity: event.velocity,
            isOn: event.isOn, stepIndex: stepBefore,
            results: results.map { stringifyResult($0) },
            triggeredRestart: false
        ))

        guard !results.isEmpty else { return }

        // Skip broadcasting for events whose only results are alreadySatisfied.
        // These change nothing visible (no step advance, no status change, no score
        // highlight update) but would compete for the bufferingNewest(1) WS write
        // slot, potentially dropping the important step-advance snapshot that follows.
        let isAllAlreadySatisfied = results.allSatisfy {
            if case .alreadySatisfied = $0 { return true } else { return false }
        }
        if isAllAlreadySatisfied { return }

        let eventTimestampMs = event.timestampNs > 0
            ? Int64(event.timestampNs / 1_000_000)
            : nil
        for r in results { applyResult(r, eventTimestampMs: eventTimestampMs, velocity: event.velocity) }

        // Legato synthesis: if the engine just advanced, check whether
        // any of the new step's notes are already physically held.
        // If so, synthesise a note-on so the engine registers them
        // immediately — the player already pressed the key before
        // releasing the previous step’s key, which is valid legato.
        if results.contains(where: { if case .advanced(let n) = $0, n != nil { return true } else { return false } }),
           let step = engine.currentStep {
            for hand in HandSide.allCases {
                guard let note = step.expectedNote(for: hand),
                      heldNotes.contains(note) else { continue }
                let synth = NoteEvent(
                    note: note, velocity: event.velocity,
                    isOn: true, timestampNs: event.timestampNs
                )
                let synthResults = engine.process(synth)
                let newStep = engine.currentStepIndex
                eventLog.append(LogEntry(
                    ms: ms, note: note, velocity: event.velocity,
                    isOn: true, stepIndex: newStep,
                    results: synthResults.map { stringifyResult($0) },
                    triggeredRestart: false
                ))
                for sr in synthResults { applyResult(sr, eventTimestampMs: eventTimestampMs, velocity: event.velocity) }
            }
        }

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
            feedback = "✓ \(noteStr)"

        case .released(let hand, _):
            setStatus(.waitingForPartner, for: hand)
            guard !isPartnerHand(hand) else { break }
            feedback = ""

        case .wrongNote(let hand, let stepIndex, _, let played):
            setStatus(.wrong(played: played), for: hand)
            guard !isPartnerHand(hand) else { break }
            feedback = "✗ \(label(hand)) played \(noteName(played)) — try again"
            mistakesByStep[stepIndex, default: 0] += 1

        case .alreadySatisfied(let hand, _):
            // The hand has already begun (or completed) the cycle for
            // this step; preserve whatever status it currently shows.
            if !isPartnerHand(hand) { alreadySatisfiedCount += 1 }

        case .legatoPrepress(let hand, let stepIndex):
            setStatus(.correct, for: hand)
            if !isPartnerHand(hand) { displayStepIndex = stepIndex + 1 }
            guard !isPartnerHand(hand) else { break }
            let legatoNoteStr = engine.currentStep
                .flatMap { $0.expectedNote(for: hand) }
                .map    { noteName($0) } ?? label(hand)
            feedback = "✓ \(legatoNoteStr)"

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

    private func rewindLesson() {
        eventLog.reset()
        engine.start(lesson: filteredLesson(for: handMode))
        leftStatus = .idle
        rightStatus = .idle
        feedback = ""
        mistakesByStep = [:]
        displayStepIndex = 0
        alreadySatisfiedCount = 0
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
                sources: midi.currentSourceNames()
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
                alreadySatisfiedCount: alreadySatisfiedCount,
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
            metronome: MetronomeState(enabled: metronomeEnabled, bpm: metronomeBpm)
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
    ///   released:right:2
    ///   wrong:left:3:50:48       (expected:played)
    ///   alreadySatisfied:right:5
    ///   notRequired:left:7
    ///   advanced:4   or   advanced:done
    ///   lessonNotStarted
    private func stringifyResult(_ result: StepResult) -> String {
        switch result {
        case .correct(let hand, let step):
            return "correct:\(hand.rawValue):\(step)"
        case .released(let hand, let step):
            return "released:\(hand.rawValue):\(step)"
        case .wrongNote(let hand, let step, let expected, let played):
            return "wrong:\(hand.rawValue):\(step):\(expected):\(played)"
        case .handNotRequired(let hand, let step):
            return "notRequired:\(hand.rawValue):\(step)"
        case .alreadySatisfied(let hand, let step):
            return "alreadySatisfied:\(hand.rawValue):\(step)"
        case .legatoPrepress(let hand, let step):
            return "legatoPrepress:\(hand.rawValue):\(step)"
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
