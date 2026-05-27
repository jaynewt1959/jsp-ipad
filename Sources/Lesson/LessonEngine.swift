//
//  LessonEngine.swift
//  JSPCore
//
//  Per-hand state machine that consumes `NoteEvent`s and decides
//  whether the user has played the right note for the right hand at
//  the right step. Pure-Swift: no MIDI, no UI.
//
//  Press-release semantics
//  -----------------------
//  Each step expects a full *press-release cycle* per required hand:
//
//      .pending  --(correct note-on)-->  .pressed(note: N)
//      .pressed  --(matching note-off)-->  .released
//
//  The engine only advances to the next step once *every* required
//  hand reaches `.released`. This matches musical practice (you
//  press, hold, then release) and avoids spurious "wrong note" errors
//  caused by note-offs arriving while the hand is still on the
//  previous step's chord.
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

    /// Per-hand phase through the current step's press-release cycle.
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

    /// Backwards-compatible helper: a hand is "satisfied" once it has
    /// completed its press-release cycle. (Pressed-but-not-released
    /// is **not** considered satisfied for advancement purposes.)
    public func isSatisfied(_ hand: HandSide) -> Bool {
        phase(hand) == .released
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
    /// Both note-on and note-off events are first-class. A typical
    /// step produces (across both hands) results in this order:
    ///
    ///     .correct(left,  i)   // LH note-on, hand: pending -> pressed
    ///     .correct(right, i)   // RH note-on, hand: pending -> pressed
    ///     .released(left,  i)  // LH note-off, hand: pressed -> released
    ///     .released(right, i)  // RH note-off, hand: pressed -> released
    ///     .advanced(toStepIndex: i+1)
    ///
    /// (Hands can interleave; order of LH/RH doesn't matter.)
    public func process(_ event: NoteEvent) -> [StepResult] {
        guard let lesson else { return [.lessonNotStarted] }

        // Already finished — silently ignore further input.
        guard currentStepIndex < lesson.steps.count else { return [] }

        let step = lesson.steps[currentStepIndex]
        let hand = attributeHand(for: event, at: step)

        // This hand isn't required at this step.
        guard step.requires(hand) else {
            return [.handNotRequired(hand: hand, stepIndex: currentStepIndex)]
        }

        if event.isOn, event.velocity > 0 {
            return processNoteOn(event: event, hand: hand, step: step)
        } else {
            return processNoteOff(event: event, hand: hand)
        }
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
            phase[hand] = .pressed(note: event.note)
            return [.correct(hand: hand, stepIndex: currentStepIndex)]

        case .pressed, .released:
            // If the played note matches the *next* step's expected note
            // for this hand, acknowledge it as a legato pre-press so the
            // coordinator can synthesise a note-on once the engine advances.
            // Otherwise it is a spurious duplicate.
            if let lesson,
               currentStepIndex + 1 < lesson.steps.count,
               lesson.steps[currentStepIndex + 1].expectedNote(for: hand) == event.note {
                return [.legatoPrepress(hand: hand, stepIndex: currentStepIndex)]
            }
            return [.alreadySatisfied(hand: hand, stepIndex: currentStepIndex)]
        }
    }

    // MARK: - Note-off

    private func processNoteOff(
        event: NoteEvent,
        hand: HandSide
    ) -> [StepResult] {
        switch phase(hand) {
        case .pressed(let heldNote) where heldNote == event.note:
            phase[hand] = .released
            var results: [StepResult] = [
                .released(hand: hand, stepIndex: currentStepIndex)
            ]
            if shouldAdvance() {
                advance(into: &results)
            }
            return results

        case .pending, .pressed, .released:
            // Note-off without a matching pending press — could be
            // the previous step's chord being released after we
            // advanced (this is the user's reported scenario), or
            // some other stray release. Either way: silently ignore;
            // do NOT emit wrongNote for releases.
            return []
        }
    }

    // MARK: - Advancement

    /// True iff every hand the current step requires has reached
    /// `.released`. Single-hand steps advance as soon as that one
    /// hand's press-release cycle completes.
    private func shouldAdvance() -> Bool {
        guard let step = currentStep else { return false }
        let leftDone  = !step.requires(.left)  || phase(.left)  == .released
        let rightDone = !step.requires(.right) || phase(.right) == .released
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
    /// Two-octave hands-together major scales overlap in MIDI range
    /// (e.g. C major: LH plays 48..72, RH plays 60..84 — they share
    /// 60..72), so a fixed split-point cannot tell them apart in the
    /// upper half of the lesson. We resolve this by giving precedence
    /// to the lesson context:
    ///
    /// 1. **Note-off**: attribute to whichever hand is currently
    ///    holding (`.pressed`) that exact MIDI note.
    /// 2. **Note-on**: if the played note matches an unsatisfied
    ///    hand's expected note for the current step, attribute to
    ///    that hand. Covers the common case of correct play.
    /// 3. Otherwise fall back to the static `handAttribution` split
    ///    point. This covers duplicates and wrong notes that don't
    ///    match either hand — in both cases we just need a sensible
    ///    label for feedback.
    private func attributeHand(for event: NoteEvent, at step: ScaleStep) -> HandSide {
        if !event.isOn {
            if case .pressed(let n) = phase(.left), n == event.note {
                return .left
            }
            if case .pressed(let n) = phase(.right), n == event.note {
                return .right
            }
            return handAttribution.hand(for: event.note)
        }

        // Primary: note matches the current step's expected note for a pending hand.
        if step.leftNote == event.note, phase(.left) == .pending {
            return .left
        }
        if step.rightNote == event.note, phase(.right) == .pending {
            return .right
        }

        // Secondary: note matches the *next* step's expected note for a non-pending hand.
        // This handles legato pre-presses where the player has already pressed (or
        // released) the current step's note and is pressing ahead into the next step.
        // Without this check, notes in the upper register (≥ split point) that belong
        // to the LH get routed to the RH by the fallback, producing spurious
        // alreadySatisfied results instead of the correct legatoPrepress.
        if let lesson,
           currentStepIndex + 1 < lesson.steps.count {
            let next = lesson.steps[currentStepIndex + 1]
            if next.leftNote == event.note, phase(.left) != .pending {
                return .left
            }
            if next.rightNote == event.note, phase(.right) != .pending {
                return .right
            }
        }

        return handAttribution.hand(for: event.note)
    }
}
