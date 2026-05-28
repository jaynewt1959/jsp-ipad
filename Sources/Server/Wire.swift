//
//  Wire.swift
//  jsp-engine
//
//  JSON shapes exchanged between the engine and the web UI over the
//  WebSocket. Frozen contract; mirror in `docs/protocol.md` and in
//  the TypeScript `web/src/api/ws.ts` once that exists.
//
//  Direction:
//    * Engine -> client: a single `Snapshot` message after every
//      state change. Clients render purely from the latest snapshot.
//    * Client -> engine: small `Command` records the user's button
//      taps trigger.
//
import Foundation

// MARK: - Server -> client

/// Top-level snapshot envelope.
public struct Snapshot: Encodable, Sendable {
    public let type: String = "snapshot"
    public let midi: MidiState
    public let lesson: LessonState
    public let handStatus: HandStatusPair
    public let feedback: String
    public let mistakesByStep: [String: Int]
    public let elapsedSec: Double?
    public let serverTimeMs: Int64
    public let metronome: MetronomeState

    public init(
        midi: MidiState,
        lesson: LessonState,
        handStatus: HandStatusPair,
        feedback: String,
        mistakesByStep: [String: Int],
        elapsedSec: Double?,
        serverTimeMs: Int64,
        metronome: MetronomeState
    ) {
        self.midi = midi
        self.lesson = lesson
        self.handStatus = handStatus
        self.feedback = feedback
        self.mistakesByStep = mistakesByStep
        self.elapsedSec = elapsedSec
        self.serverTimeMs = serverTimeMs
        self.metronome = metronome
    }
}

public struct MidiState: Encodable, Sendable {
    public let running: Bool
    public let sources: [String]
}

public struct LessonState: Encodable, Sendable {
    public let key: String
    public let direction: String
    public let handsMode: String
    public let totalSteps: Int
    public let currentStepIndex: Int
    public let isCompleted: Bool
    public let currentStep: StepState?
    /// Unix-epoch ms when the current lesson run started (resets on each rewind).
    public let lessonStartMs: Int64
    /// Unix-epoch ms when the most recent *correct* note-on arrived.
    /// nil until the user has played at least one correct note in this run.
    public let lastNoteOnMs: Int64?
    /// Step index the score view should highlight. Advances on both
    /// `.advanced` and `.legatoPrepress` so the green ellipse tracks
    /// the physically-pressed note even before the engine advances.
    public let displayStepIndex: Int
    /// Number of `.alreadySatisfied` events for the active hand since
    /// the last rewind — i.e. notes re-pressed while still being held.
    /// Counted toward the accuracy score alongside wrong-note mistakes.
    public let alreadySatisfiedCount: Int
    /// Average milliseconds between first and second hand arriving on the
    /// same step, in `.together` mode. nil until at least one step completes
    /// or in single-hand modes.
    public let avgSyncMs: Double?
    /// Best (smallest) sync gap observed across all steps so far.
    public let minSyncMs: Double?
    /// Worst (largest) sync gap observed across all steps so far.
    public let maxSyncMs: Double?
    /// Step index (0-based) at which the worst sync gap occurred.
    public let worstSyncStep: Int?
    /// Coefficient of variation (stddev/mean × 100) of correct-note velocities.
    /// Lower = more even. nil until ≥2 correct notes played.
    public let velocityCV: Double?
}

/// Current metronome settings, always included in the snapshot.
public struct MetronomeState: Encodable, Sendable {
    public let enabled: Bool
    public let bpm: Int
}

public struct StepState: Encodable, Sendable {
    public let leftNote: Int?
    public let leftFinger: Int?
    public let rightNote: Int?
    public let rightFinger: Int?
}

public struct HandStatusPair: Encodable, Sendable {
    public let left: WireHandStatus
    public let right: WireHandStatus
}

/// Discriminated-union encoded as `{ "kind": ..., "played": ... }`.
public enum WireHandStatus: Equatable, Sendable {
    case idle
    case waitingForPartner
    case correct
    case wrong(played: Int)
}

extension WireHandStatus: Encodable {
    enum CodingKeys: String, CodingKey { case kind, played }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .idle:
            try container.encode("idle", forKey: .kind)
        case .waitingForPartner:
            try container.encode("waitingForPartner", forKey: .kind)
        case .correct:
            try container.encode("correct", forKey: .kind)
        case .wrong(let played):
            try container.encode("wrong", forKey: .kind)
            try container.encode(played, forKey: .played)
        }
    }
}

// MARK: - Client -> server

/// Inbound command envelope.
public struct InboundCommand: Decodable, Sendable {
    public let type: String
    /// Payload for `setHandMode`.
    public let handMode: String?
    /// Payload for `setMetronome`.
    public let metronomeEnabled: Bool?
    public let metronomeBpm: Int?
    /// Payload for `setScale` — a `KeySignature.rawValue` string.
    public let scaleKey: String?
    /// Payload for `setDirection` — a `Direction.rawValue` string.
    public let direction: String?
    /// When true, `restartLesson` also discards the previous run's event
    /// log (manual Reset). Loop restarts omit this so Analyze can still
    /// inspect the completed run.
    public let clearHistory: Bool?
}

public enum CommandType: String {
    case startLesson
    case restartLesson
    case stopMidi
    case requestDebugLog
    case setHandMode
    case setMetronome
    case setScale
    case setDirection
    case ping
}

// MARK: - Debug log response (server -> client)

/// Carries the full in-memory event log back to a requesting client.
/// Triggered by a `requestDebugLog` command; broadcast to all clients
/// (there is typically only one).
public struct DebugLogMessage: Encodable, Sendable {
    public let type: String = "debugLog"
    public let entries: [LogEntry]

    public init(entries: [LogEntry]) {
        self.entries = entries
    }
}

// MARK: - Construction helpers

extension StepState {
    init(_ step: ScaleStep) {
        self.init(
            leftNote: step.leftNote,
            leftFinger: step.leftFinger,
            rightNote: step.rightNote,
            rightFinger: step.rightFinger
        )
    }
}
