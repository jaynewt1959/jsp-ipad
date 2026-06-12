//
//  Models.swift
//  JSPCore
//
//  Pure-Swift data model used by the lesson engine.
//  No CoreMIDI / SwiftUI dependencies so this file can be unit-tested
//  via `swift test` and reused from the Xcode app target unchanged.
//
import Foundation

// MARK: - Key, direction, hand

/// The lesson's key signature — one case per scale taught by the app.
/// Major scales follow circle-of-5ths order; the natural, harmonic, and
/// melodic minor scales each mirror the same 12 roots.  `rawValue` is the
/// camelCase name used in the WebSocket wire (e.g. "cMajor", "aNaturalMinor",
/// "aHarmonicMinor", "aMelodicMinor").
public enum KeySignature: String, Codable, Equatable, CaseIterable {
    // MARK: Major
    case cMajor
    case gMajor
    case dMajor
    case aMajor
    case eMajor
    case bMajor
    case fSharpMajor
    case cSharpMajor
    case abMajor
    case ebMajor
    case bbMajor
    case fMajor
    // MARK: Natural minor
    case cNaturalMinor
    case gNaturalMinor
    case dNaturalMinor
    case aNaturalMinor
    case eNaturalMinor
    case bNaturalMinor
    case fSharpNaturalMinor
    case cSharpNaturalMinor
    case abNaturalMinor
    case ebNaturalMinor
    case bbNaturalMinor
    case fNaturalMinor
    // MARK: Harmonic minor
    case cHarmonicMinor
    case gHarmonicMinor
    case dHarmonicMinor
    case aHarmonicMinor
    case eHarmonicMinor
    case bHarmonicMinor
    case fSharpHarmonicMinor
    case cSharpHarmonicMinor
    case abHarmonicMinor
    case ebHarmonicMinor
    case bbHarmonicMinor
    case fHarmonicMinor
    // MARK: Melodic minor
    case cMelodicMinor
    case gMelodicMinor
    case dMelodicMinor
    case aMelodicMinor
    case eMelodicMinor
    case bMelodicMinor
    case fSharpMelodicMinor
    case cSharpMelodicMinor
    case abMelodicMinor
    case ebMelodicMinor
    case bbMelodicMinor
    case fMelodicMinor
}

/// Direction of travel through the scale.
public enum Direction: String, Codable, Equatable, CaseIterable {
    case ascending
    case descending
    case ascendingDescending
}

/// Which hand played a note (or which hand a step is asking for).
public enum HandSide: String, Codable, Equatable, CaseIterable {
    case left
    case right
}

/// Coarse-grained "what the lesson is asking the user to do" used by
/// the UI; the engine itself derives the per-step requirements from
/// the `ScaleStep`s, so this is mainly informational.
public enum HandsMode: String, Codable, Equatable, CaseIterable {
    case rightOnly
    case leftOnly
    case together
}

// MARK: - Scale step

/// One step of a scale lesson.
///
/// A step holds the note expected from each hand at that point in the
/// scale, plus the finger the user is being prompted to use. For
/// single-hand lessons one side is `nil`; for hands-together both
/// sides are populated.
///
/// `waitForBothHands` controls advancement: when true (and both hands
/// are required for this step) the engine will not move to step
/// `i + 1` until both hands have played their expected note. The MVP
/// flags this on every hands-together step so the user can never
/// "race ahead" with one hand and end up with the wrong finger on
/// the next root note.
public struct ScaleStep: Equatable, Codable {
    /// MIDI note (0-127) the left hand is expected to play, or nil.
    public let leftNote: Int?
    /// Finger 1-5 the left hand is being prompted to use. nil iff
    /// `leftNote` is nil.
    public let leftFinger: Int?
    /// MIDI note (0-127) the right hand is expected to play, or nil.
    public let rightNote: Int?
    /// Finger 1-5 the right hand is being prompted to use. nil iff
    /// `rightNote` is nil.
    public let rightFinger: Int?
    /// If true, the engine waits for every required hand to register
    /// a correct note before advancing. Always true in hands-together
    /// MVP; can be relaxed for free-running drills later.
    public let waitForBothHands: Bool

    public init(
        leftNote: Int?,
        leftFinger: Int?,
        rightNote: Int?,
        rightFinger: Int?,
        waitForBothHands: Bool
    ) {
        self.leftNote = leftNote
        self.leftFinger = leftFinger
        self.rightNote = rightNote
        self.rightFinger = rightFinger
        self.waitForBothHands = waitForBothHands
    }

    /// Whether the given hand is required to play at this step.
    public func requires(_ hand: HandSide) -> Bool {
        switch hand {
        case .left:  return leftNote != nil
        case .right: return rightNote != nil
        }
    }

    /// Note expected from the given hand at this step, or nil.
    public func expectedNote(for hand: HandSide) -> Int? {
        switch hand {
        case .left:  return leftNote
        case .right: return rightNote
        }
    }

    /// Finger expected from the given hand at this step, or nil.
    public func expectedFinger(for hand: HandSide) -> Int? {
        switch hand {
        case .left:  return leftFinger
        case .right: return rightFinger
        }
    }
}

// MARK: - Lesson

/// A complete lesson: a key, a direction, a hands-mode label, and the
/// ordered list of steps the user must work through.
public struct ScaleLesson: Equatable, Codable {
    public let key: KeySignature
    public let direction: Direction
    public let handsMode: HandsMode
    public let steps: [ScaleStep]

    public init(
        key: KeySignature,
        direction: Direction,
        handsMode: HandsMode,
        steps: [ScaleStep]
    ) {
        self.key = key
        self.direction = direction
        self.handsMode = handsMode
        self.steps = steps
    }
}

// MARK: - MIDI event

/// A normalized MIDI note-on / note-off event handed from the
/// platform-specific `MidiEngine` into the lesson engine.
///
/// Pure data, no CoreMIDI types, so this is safe to use from tests.
public struct NoteEvent: Equatable, Codable {
    public let note: Int        // 0-127
    public let velocity: Int    // 0-127
    public let isOn: Bool       // true = note-on with velocity > 0
    /// Mach absolute / host-clock-derived timestamp in nanoseconds.
    /// 0 is acceptable in tests where timing isn't relevant.
    public let timestampNs: UInt64

    public init(note: Int, velocity: Int, isOn: Bool, timestampNs: UInt64) {
        self.note = note
        self.velocity = velocity
        self.isOn = isOn
        self.timestampNs = timestampNs
    }
}

// MARK: - Step result

/// Outcome of evaluating an incoming `NoteEvent` against the current
/// step, scoped to the hand the engine attributed it to.
///
/// - `.correct`: right note-on for that hand at this step. The hand
///   is now `.satisfied` — waiting for the partner hand (if any)
///   before the engine advances. No release required.
/// - `.wrongNote`: that hand's note didn't match. `expected` is what
///   the lesson wanted, `played` is what arrived. The hand stays
///   `.pending` so the user can try again.
/// - `.handNotRequired`: this step doesn't expect this hand to play.
/// - `.advanced`: emitted when every required hand is satisfied and
///   the engine moves to the next step (or completes). Carries the
///   new step index, or nil if the lesson is finished.
public enum StepResult: Equatable {
    case correct(hand: HandSide, stepIndex: Int)
    case wrongNote(hand: HandSide, stepIndex: Int, expected: Int, played: Int)
    case handNotRequired(hand: HandSide, stepIndex: Int)
    case advanced(toStepIndex: Int?)
    case lessonNotStarted
}

// MARK: - Hand phase

/// Per-hand progress through the current step.
/// The engine advances as soon as every required hand is `.satisfied`.
public enum HandPhase: Equatable {
    /// Nothing has happened on this hand for the current step.
    case pending
    /// The hand played the correct note-on. Waiting for the partner
    /// hand (if any) before the engine advances.
    case satisfied
}

// MARK: - Hand attribution

/// Strategy for attributing an incoming MIDI note to a hand.
/// The MVP uses a fixed split point (default middle C, MIDI 60):
/// notes < split → left hand, notes >= split → right hand.
/// This is correct for two-octave hands-together major scales where
/// the left hand stays below middle C and the right hand stays at
/// or above it.
public struct HandAttribution: Equatable {
    public let splitPoint: Int

    public init(splitPoint: Int = 60) {
        self.splitPoint = splitPoint
    }

    public func hand(for midiNote: Int) -> HandSide {
        return midiNote < splitPoint ? .left : .right
    }
}
