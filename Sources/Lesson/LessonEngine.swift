//
//  LessonEngine.swift
//  JSPCore
//
//  Per-hand state machine that consumes `NoteEvent`s and decides
//  whether the user has played the right note for the right hand at
//  the right step. Pure-Swift: no MIDI, no UI.
//
//  Advancement semantics
//  ---------------------
//  Each step requires a correct note-on from every required hand.
//  Note-offs are irrelevant to advancement; stale-note precision
//  tracking is handled separately in SessionCoordinator.
//
//      .pending  --(correct note-on)-->  .satisfied
//
//  The engine advances to the next step once every required hand
//  reaches `.satisfied`.
//
import Foundation

/// Public-facing snapshot of where the engine currently is.
public enum EngineState: Equatable {
    case idle                                   // no lesson loaded
    case awaiting(stepIndex: Int)               // mid-lesson
    case completed                              // user reached the end
}

/// The lesson engine.
///
/// Usage:
///   let engine = LessonEngine()
///   engine.start(lesson: CMajor.handsTogetherAscendingTwoOctaves)
///   let results = engine.process(noteOn(60))
///   _ = engine.process(noteOff(60))
///   ...
///
/// The engine does **not** drive its own input — callers feed it
/// `NoteEvent`s, which makes it trivially testable. The iOS / Mac app
/// wires `MidiInput` events into `process(_:)`; tests synthesize
/// events.
///
/// Concurrency: not thread-safe. Call from a single thread/actor (the
/// app uses an actor via `SessionCoordinator`).
public final class LessonEngine {

    // MARK: - Configuration

    /// How to map a MIDI note number onto a hand when the lesson
    /// context can't disambiguate (e.g. a wrong note that doesn't
    /// match either hand's expected note).
    public var handAttribution: HandAttribution

    public init(handAttribution: HandAttribution = HandAttribution()) {
        self.handAttribution = handAttribution
    }

    // MARK: - State

    public private(set) var lesson: ScaleLesson?
    public private(set) var currentStepIndex: Int = 0

    /// Per-hand phase through the current step.
    private var phase: [HandSide: HandPhase] = [.left: .pending, .right: .pending]

    public var state: EngineState {
        guard let lesson else { return .idle }
        if currentStepIndex >= lesson.steps.count { return .completed }
        return .awaiting(stepIndex: currentStepIndex)
    }

    /// Convenience accessor used by the UI.
    public var currentStep: ScaleStep? {
        guard let lesson, currentStepIndex < lesson.steps.count else { return nil }
        return lesson.steps[currentStepIndex]
    }

    /// Current per-hand phase. Useful for tests and UI.
    public func phase(_ hand: HandSide) -> HandPhase {
        phase[hand] ?? .pending
    }

    /// True once the hand has played the correct note-on for the current step.
    public func isSatisfied(_ hand: HandSide) -> Bool {
        phase(hand) == .satisfied
    }

    // MARK: - Lifecycle

    /// Load a lesson and rewind to step 0.
    public func start(lesson: ScaleLesson) {
        self.lesson = lesson
        self.currentStepIndex = 0
        self.phase = [.left: .pending, .right: .pending]
    }

    /// Reset back to idle (no lesson loaded).
    public func reset() {
        self.lesson = nil
        self.currentStepIndex = 0
        self.phase = [.left: .pending, .right: .pending]
    }

    // MARK: - Event processing

    /// Feed one MIDI event in; receive zero or more results to render.
    ///
    /// Only note-on events drive advancement. A typical step produces:
    ///
    ///     .correct(left,  i)   // LH note-on matches expected
    ///     .correct(right, i)   // RH note-on matches expected
    ///     .advanced(toStepIndex: i+1)
    ///
    /// Note-off events are silently ignored by the engine; stale-note
    /// precision tracking is done by the coordinator using `heldNotes`.
    public func process(_ event: NoteEvent) -> [StepResult] {
        guard let lesson else { return [.lessonNotStarted] }

        // Already finished — silently ignore further input.
        guard currentStepIndex < lesson.steps.count else { return [] }

        // Note-offs are not used for advancement.
        guard event.isOn, event.velocity > 0 else { return [] }

        let step = lesson.steps[currentStepIndex]
        let hand = attributeHand(for: event, at: step)

        // This hand isn't required at this step.
        guard step.requires(hand) else {
            return [.handNotRequired(hand: hand, stepIndex: currentStepIndex)]
        }

        return processNoteOn(event: event, hand: hand, step: step)
    }

    // MARK: - Note-on

    private func processNoteOn(
        event: NoteEvent,
        hand: HandSide,
        step: ScaleStep
    ) -> [StepResult] {
        switch phase(hand) {
        case .pending:
            let expected = step.expectedNote(for: hand)!
            guard event.note == expected else {
                return [
                    .wrongNote(
                        hand: hand,
                        stepIndex: currentStepIndex,
                        expected: expected,
                        played: event.note
                    )
                ]
            }
            phase[hand] = .satisfied
            var results: [StepResult] = [.correct(hand: hand, stepIndex: currentStepIndex)]
            if shouldAdvance() {
                advance(into: &results)
            }
            return results

        case .satisfied:
            // Hand already satisfied this step; duplicate note-on ignored.
            return []
        }
    }

    // MARK: - Advancement

    /// True iff every required hand for the current step has played
    /// its correct note-on (is `.satisfied`).
    private func shouldAdvance() -> Bool {
        guard let step = currentStep else { return false }
        let leftDone  = !step.requires(.left)  || phase(.left)  == .satisfied
        let rightDone = !step.requires(.right) || phase(.right) == .satisfied
        return leftDone && rightDone
    }

    private func advance(into results: inout [StepResult]) {
        guard let lesson else { return }
        currentStepIndex += 1
        phase = [.left: .pending, .right: .pending]
        let next: Int? = currentStepIndex < lesson.steps.count
            ? currentStepIndex
            : nil
        results.append(.advanced(toStepIndex: next))
    }

    // MARK: - Hand attribution

    /// Decide which hand the engine should attribute `event` to.
    ///
    /// Two-octave hands-together scales can overlap in MIDI range, so
    /// a fixed split-point is not reliable in the upper register. We
    /// give precedence to the lesson context:
    ///
    /// 1. If the note matches the current step's expected note for a
    ///    pending hand, attribute to that hand.
    /// 2. Otherwise fall back to the static `handAttribution` split
    ///    point for wrong notes and duplicates.
    private func attributeHand(for event: NoteEvent, at step: ScaleStep) -> HandSide {
        // Primary: note matches the current step's expected note for a pending hand.
        if step.leftNote == event.note, phase(.left) == .pending {
            return .left
        }
        if step.rightNote == event.note, phase(.right) == .pending {
            return .right
        }

        return handAttribution.hand(for: event.note)
    }
}
