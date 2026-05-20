//
//  SyncMetrics.swift
//  JSPCore
//
//  Helpers for hand-sync timing metrics shown in the UI summary.
//
import Foundation

/// Pure helper for computing a hand-sync gap in milliseconds.
///
/// Preferred source is event-clock time derived from MIDI packet
/// timestamps. If either side is missing an event timestamp, we fall
/// back to wall-clock timestamps captured at processing time.
public enum SyncMetrics {
    public static func handSyncGapMs(
        firstEventMs: Int64?,
        secondEventMs: Int64?,
        firstWallMs: Int64,
        secondWallMs: Int64
    ) -> Double {
        if let firstEventMs, let secondEventMs {
            return Double(abs(secondEventMs - firstEventMs))
        }
        return Double(abs(secondWallMs - firstWallMs))
    }
}
