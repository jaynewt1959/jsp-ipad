//
//  CMajor.swift
//  JSPCore
//
//  Hard-coded C major two-octave scale data for the MVP.
//  Lives in pure-Swift land so it can be unit-tested directly.
//
import Foundation

/// Namespace for C major scale data.
///
/// Standard two-octave fingerings:
///   Right hand ascending: 1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
///   Left  hand ascending: 5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
///
/// MIDI notes (C major, no accidentals):
///   Left  hand: C3..C5 → 48 50 52 53 55 57 59 60 62 64 65 67 69 71 72
///   Right hand: C4..C6 → 60 62 64 65 67 69 71 72 74 76 77 79 81 83 84
///
/// 15 steps in total. We mark every step `waitForBothHands = true`
/// for hands-together so the engine never lets one hand race ahead —
/// that is precisely the coordination problem the app is meant to
/// fix.
public enum CMajor {

    /// MIDI notes for the C major scale starting at the given root,
    /// going up two octaves (15 notes total).
    private static func ascendingTwoOctaves(rootMidi: Int) -> [Int] {
        // Intervals (semitones) of a major scale: W W H W W W H, repeated.
        let semitones = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]
        return semitones.map { rootMidi + $0 }
    }

    /// Right-hand fingering for C major two-octave ascending.
    private static let rightHandAscendingFingers: [Int] =
        [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]

    /// Left-hand fingering for C major two-octave ascending.
    private static let leftHandAscendingFingers: [Int] =
        [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]

    /// Right-hand fingering for the descending leg (B5 → C4).
    /// Derived from the reverse of the ascending pattern, starting
    /// after the turnaround C6 (finger 5).
    private static let rightHandDescendingFingers: [Int] =
        [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]

    /// Left-hand fingering for the descending leg (B4 → C3).
    /// Derived from the reverse of the ascending pattern, starting
    /// after the turnaround C5 (finger 1).
    private static let leftHandDescendingFingers: [Int] =
        [2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]

    /// The descending leg of the scale, starting one semitone-step below
    /// the top note (i.e. the turnaround note is not repeated).
    private static func descendingTwoOctaves(rootMidi: Int) -> [Int] {
        Array(ascendingTwoOctaves(rootMidi: rootMidi).reversed().dropFirst())
    }

    /// Hands-together ascending two-octave C major lesson.
    /// Left hand starts on C3 (MIDI 48); right hand starts on C4 (MIDI 60).
    public static let handsTogetherAscendingTwoOctaves: ScaleLesson = {
        let leftNotes = ascendingTwoOctaves(rootMidi: 48)
        let rightNotes = ascendingTwoOctaves(rootMidi: 60)
        precondition(leftNotes.count == rightNotes.count)
        precondition(leftNotes.count == leftHandAscendingFingers.count)
        precondition(leftNotes.count == rightHandAscendingFingers.count)

        let steps: [ScaleStep] = (0..<leftNotes.count).map { i in
            ScaleStep(
                leftNote: leftNotes[i],
                leftFinger: leftHandAscendingFingers[i],
                rightNote: rightNotes[i],
                rightFinger: rightHandAscendingFingers[i],
                // Always wait for both hands in hands-together: the
                // whole point of this lesson is per-step alignment.
                waitForBothHands: true
            )
        }

        return ScaleLesson(
            key: .cMajor,
            direction: .ascending,
            handsMode: .together,
            steps: steps
        )
    }()

    /// Hands-together ascending + descending two-octave C major lesson.
    /// 29 steps: 15 ascending (C3/C4 → C5/C6) then 14 descending
    /// (B4/B5 → C3/C4). The turnaround top notes C5 and C6 are played
    /// once (as the final ascending step) and not repeated.
    public static let handsTogetherAscendingDescendingTwoOctaves: ScaleLesson = {
        let leftAsc  = ascendingTwoOctaves(rootMidi: 48)
        let rightAsc = ascendingTwoOctaves(rootMidi: 60)
        let leftDesc  = descendingTwoOctaves(rootMidi: 48)
        let rightDesc = descendingTwoOctaves(rootMidi: 60)

        precondition(leftAsc.count  == leftHandAscendingFingers.count)
        precondition(rightAsc.count == rightHandAscendingFingers.count)
        precondition(leftDesc.count  == leftHandDescendingFingers.count)
        precondition(rightDesc.count == rightHandDescendingFingers.count)

        let ascSteps: [ScaleStep] = (0..<leftAsc.count).map { i in
            ScaleStep(
                leftNote: leftAsc[i], leftFinger: leftHandAscendingFingers[i],
                rightNote: rightAsc[i], rightFinger: rightHandAscendingFingers[i],
                waitForBothHands: true
            )
        }
        let descSteps: [ScaleStep] = (0..<leftDesc.count).map { i in
            ScaleStep(
                leftNote: leftDesc[i], leftFinger: leftHandDescendingFingers[i],
                rightNote: rightDesc[i], rightFinger: rightHandDescendingFingers[i],
                waitForBothHands: true
            )
        }
        return ScaleLesson(
            key: .cMajor,
            direction: .ascendingDescending,
            handsMode: .together,
            steps: ascSteps + descSteps
        )
    }()
}
