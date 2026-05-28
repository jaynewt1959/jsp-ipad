//
//  EventLog.swift
//  jsp-engine
//
//  Always-on in-memory event log for diagnostic capture.
//  Every MIDI event processed by SessionCoordinator is appended here
//  with its engine interpretation so that a DEBUG request can replay
//  exactly what the engine saw and help diagnose synchronisation issues.
//
import Foundation

// MARK: - Log entry (wire-ready)

/// One timestamped MIDI event and its engine interpretation.
/// Sent to the client as part of a `DebugLogMessage`.
public struct LogEntry: Encodable, Sendable {
    /// Milliseconds elapsed since the current lesson started (or since
    /// MIDI was enabled if the lesson has not yet been rewound).
    public let ms: Int
    /// MIDI note number 0–127.
    public let note: Int
    /// Note velocity 0–127.
    public let velocity: Int
    /// `true` = note-on (velocity > 0); `false` = note-off.
    public let isOn: Bool
    /// Lesson step index at the moment this event arrived.
    public let stepIndex: Int
    /// Stringified engine results produced for this event.
    /// Empty when the engine produced no results (e.g. stray note-offs).
    /// Special value `["restart"]` for the C3+C4 gesture that rewound
    /// the lesson.
    public let results: [String]
    /// `true` when this note-on was the second of the two step-0 notes
    /// that triggered an automatic lesson rewind.
    public let triggeredRestart: Bool
}

// MARK: - Ring buffer

/// A bounded ring-buffer of `LogEntry` values.
///
/// Not thread-safe. The owning `SessionCoordinator` actor serialises
/// all mutations, so no additional locking is needed.
struct EventLog {
    private let capacity: Int
    private var entries: [LogEntry] = []
    /// Snapshot of the previous run's entries, preserved across a single
    /// reset so that Analyze can still inspect the completed run even
    /// after a loop/manual restart has cleared the live log.
    private var previousEntries: [LogEntry] = []

    init(capacity: Int = 1000) {
        self.capacity = capacity
        entries.reserveCapacity(min(capacity, 256))
    }

    mutating func append(_ entry: LogEntry) {
        if entries.count >= capacity {
            entries.removeFirst()
        }
        entries.append(entry)
    }

    /// Save current entries as the previous run and clear the live log.
    mutating func reset() {
        previousEntries = entries
        entries.removeAll(keepingCapacity: true)
    }

    /// Discard both current and previous entries (manual Reset).
    mutating func clearAll() {
        entries.removeAll(keepingCapacity: true)
        previousEntries.removeAll()
    }

    /// Current run's entries, falling back to the previous run if the
    /// current run has no events yet (e.g. after a loop restart before
    /// the user plays the first note).
    var all: [LogEntry] { entries.isEmpty ? previousEntries : entries }
    var count: Int      { entries.count }
}
