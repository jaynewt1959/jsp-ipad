//
//  ScaleLibrary.swift
//  JSPCore
//
//  Static scale data for all 12 major and 12 natural minor scales.
//  Fingerings are taken directly from the eNovativePiano score images
//  in web/public/scores/.  If a fingering looks wrong in the UI, compare
//  it against the corresponding PNG — the PNG is the source of truth.
//
//  MIDI root notes place each scale in a practical two-octave register:
//    LH: roots roughly in octave 2–3 (MIDI 42–53)
//    RH: roots one octave higher (MIDI 54–65)
//  This matches the printed score layout so the score highlight overlay
//  will align.
//
import Foundation

// MARK: - Internal definition type

private struct ScaleDef {
    let key:          KeySignature
    /// MIDI note the LEFT-hand starts on (ascending, root octave).
    let lhRoot:       Int
    /// MIDI note the RIGHT-hand starts on (ascending, root octave).
    let rhRoot:       Int
    /// Semitone offsets from root for all 15 scale degrees (0…24).
    let intervals:    [Int]   // count == 15
    /// RH fingering ascending (15 values, 1-5).
    let rhAsc:        [Int]   // count == 15
    /// LH fingering ascending (15 values, 1-5).
    let lhAsc:        [Int]   // count == 15
    /// RH fingering descending (14 values, starting from degree 14 down to degree 1).
    let rhDesc:       [Int]   // count == 14
    /// LH fingering descending (14 values, starting from degree 14 down to degree 1).
    let lhDesc:       [Int]   // count == 14
}

// MARK: - Shared interval patterns

/// Major scale semitone offsets (W W H W W W H, two octaves).
private let majorIntervals: [Int] =
    [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]

/// Natural minor scale semitone offsets (W H W W H W W, two octaves).
private let naturalMinorIntervals: [Int] =
    [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24]

// MARK: - Shared fingering groups
//
// Naming reflects the group of scales that share the pattern.
// All arrays have the counts shown above (15 for asc, 14 for desc).

// Group 1: C G D A E  major  and  C G D A E natural minor
// RH starts on white key, standard thumb-crossings at 4th/8th notes.
private let g1_rhAsc:  [Int] = [1,2,3,1,2,3,4,1,2,3,1,2,3,4,5]
private let g1_lhAsc:  [Int] = [5,4,3,2,1,3,2,1,4,3,2,1,3,2,1]
private let g1_rhDesc: [Int] = [4,3,2,1,3,2,1,4,3,2,1,3,2,1]
private let g1_lhDesc: [Int] = [2,3,1,2,3,4,1,2,3,1,2,3,4,5]

// Group 2: F major and F natural minor
// RH crosses thumb after Bb (4th note), different from group 1.
private let g2_rhAsc:  [Int] = [1,2,3,4,1,2,3,1,2,3,4,1,2,3,4]
private let g2_lhAsc:  [Int] = [5,4,3,2,1,3,2,1,4,3,2,1,3,2,1] // same as G1
private let g2_rhDesc: [Int] = [3,2,1,4,3,2,1,3,2,1,4,3,2,1]
private let g2_lhDesc: [Int] = [2,3,1,2,3,4,1,2,3,1,2,3,4,5]   // same as G1

// Group 3: B major and B natural minor
// LH starts on B2 (finger 4), different from group 1.
private let g3_rhAsc:  [Int] = [1,2,3,1,2,3,4,1,2,3,1,2,3,4,5] // same as G1
private let g3_lhAsc:  [Int] = [4,3,2,1,4,3,2,1,3,2,1,4,3,2,1]
private let g3_rhDesc: [Int] = [4,3,2,1,3,2,1,4,3,2,1,3,2,1]   // same as G1
private let g3_lhDesc: [Int] = [2,3,4,1,2,3,1,2,3,4,1,2,3,4]

// Group 4: F# major  (RH starts on black key finger 2)
private let g4_rhAsc:  [Int] = [2,3,4,1,2,3,1,2,3,4,1,2,3,1,2]
private let g4_lhAsc:  [Int] = [4,3,2,1,3,2,1,4,3,2,1,3,2,1,4]
private let g4_rhDesc: [Int] = [1,3,2,1,4,3,2,1,3,2,1,4,3,2]
private let g4_lhDesc: [Int] = [1,2,3,1,2,3,4,1,2,3,1,2,3,4]

// Group 5: C# major
private let g5_rhAsc:  [Int] = [2,3,1,2,3,4,1,2,3,1,2,3,4,1,2]
private let g5_lhAsc:  [Int] = [3,2,1,4,3,2,1,3,2,1,4,3,2,1,3]
private let g5_rhDesc: [Int] = [1,4,3,2,1,3,2,1,4,3,2,1,3,2]
private let g5_lhDesc: [Int] = [1,2,3,4,1,2,3,1,2,3,4,1,2,3]

// Group 6: Ab major, Eb major, Bb major  (LH: flat-key pattern starting on 3)
private let g6_lhAsc:  [Int] = [3,2,1,4,3,2,1,3,2,1,4,3,2,1,3]
private let g6_lhDesc: [Int] = [1,2,3,4,1,2,3,1,2,3,4,1,2,3]

private let abMaj_rhAsc:  [Int] = [3,4,1,2,3,1,2,3,4,1,2,3,1,2,3]
private let abMaj_rhDesc: [Int] = [2,1,3,2,1,4,3,2,1,3,2,1,4,3]

private let ebMaj_rhAsc:  [Int] = [3,1,2,3,4,1,2,3,1,2,3,4,1,2,3]
private let ebMaj_rhDesc: [Int] = [2,1,4,3,2,1,3,2,1,4,3,2,1,3]

private let bbMaj_rhAsc:  [Int] = [4,1,2,3,1,2,3,4,1,2,3,1,2,3,4]
private let bbMaj_rhDesc: [Int] = [3,2,1,3,2,1,4,3,2,1,3,2,1,4]

// Group 7: F# natural minor  (RH starts on black key finger 3, different from F# major)
private let g7_rhAsc:  [Int] = [3,4,1,2,3,1,2,3,4,1,2,3,1,2,3]
private let g7_rhDesc: [Int] = [2,1,3,2,1,4,3,2,1,3,2,1,4,3]   // same as Ab major RH desc
// LH same as G4 (F# major)

// Group 8: C# natural minor  (RH same as G7, LH same as G5 / C# major)
// (no new arrays needed, reuse g7 for RH and g5_lhAsc/g5_lhDesc for LH)

// Group 9: Ab natural minor  (RH same as Ab major; LH different — uses 3 2 1 3 pattern)
private let abMin_lhAsc:  [Int] = [3,2,1,3,2,1,4,3,2,1,3,2,1,4,3]
private let abMin_lhDesc: [Int] = [4,1,2,3,1,2,3,4,1,2,3,1,2,3]

// Group 10: Eb natural minor  (RH same as Eb major; LH different)
private let ebMin_lhAsc:  [Int] = [2,1,4,3,2,1,3,2,1,4,3,2,1,2,3]
private let ebMin_lhDesc: [Int] = [2,1,2,3,4,1,2,3,1,2,3,4,1,2]

// Group 11: Bb natural minor  (RH same as Bb major; LH different)
private let bbMin_lhAsc:  [Int] = [2,1,3,2,1,4,3,2,1,3,2,1,4,3,2]
private let bbMin_lhDesc: [Int] = [3,4,1,2,3,1,2,3,4,1,2,3,1,2]

// MARK: - Scale definitions table

private let allDefs: [ScaleDef] = [

    // ----------------------------------------------------------------
    // MAJOR SCALES
    // ----------------------------------------------------------------

    ScaleDef(key: .cMajor,
             lhRoot: 48, rhRoot: 60, intervals: majorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .gMajor,
             lhRoot: 43, rhRoot: 55, intervals: majorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .dMajor,
             lhRoot: 50, rhRoot: 62, intervals: majorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .aMajor,
             lhRoot: 45, rhRoot: 57, intervals: majorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .eMajor,
             lhRoot: 52, rhRoot: 64, intervals: majorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .bMajor,
             lhRoot: 47, rhRoot: 59, intervals: majorIntervals,
             rhAsc: g3_rhAsc,  lhAsc: g3_lhAsc,
             rhDesc: g3_rhDesc, lhDesc: g3_lhDesc),

    ScaleDef(key: .fSharpMajor,
             lhRoot: 42, rhRoot: 54, intervals: majorIntervals,
             rhAsc: g4_rhAsc,  lhAsc: g4_lhAsc,
             rhDesc: g4_rhDesc, lhDesc: g4_lhDesc),

    ScaleDef(key: .cSharpMajor,
             lhRoot: 49, rhRoot: 61, intervals: majorIntervals,
             rhAsc: g5_rhAsc,  lhAsc: g5_lhAsc,
             rhDesc: g5_rhDesc, lhDesc: g5_lhDesc),

    ScaleDef(key: .abMajor,
             lhRoot: 44, rhRoot: 56, intervals: majorIntervals,
             rhAsc: abMaj_rhAsc,  lhAsc: g6_lhAsc,
             rhDesc: abMaj_rhDesc, lhDesc: g6_lhDesc),

    ScaleDef(key: .ebMajor,
             lhRoot: 51, rhRoot: 63, intervals: majorIntervals,
             rhAsc: ebMaj_rhAsc,  lhAsc: g6_lhAsc,
             rhDesc: ebMaj_rhDesc, lhDesc: g6_lhDesc),

    ScaleDef(key: .bbMajor,
             lhRoot: 46, rhRoot: 58, intervals: majorIntervals,
             rhAsc: bbMaj_rhAsc,  lhAsc: g6_lhAsc,
             rhDesc: bbMaj_rhDesc, lhDesc: g6_lhDesc),

    ScaleDef(key: .fMajor,
             lhRoot: 53, rhRoot: 65, intervals: majorIntervals,
             rhAsc: g2_rhAsc,  lhAsc: g2_lhAsc,
             rhDesc: g2_rhDesc, lhDesc: g2_lhDesc),

    // ----------------------------------------------------------------
    // NATURAL MINOR SCALES  (same roots as their major counterpart)
    // ----------------------------------------------------------------

    ScaleDef(key: .cNaturalMinor,
             lhRoot: 48, rhRoot: 60, intervals: naturalMinorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .gNaturalMinor,
             lhRoot: 43, rhRoot: 55, intervals: naturalMinorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .dNaturalMinor,
             lhRoot: 50, rhRoot: 62, intervals: naturalMinorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .aNaturalMinor,
             lhRoot: 45, rhRoot: 57, intervals: naturalMinorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .eNaturalMinor,
             lhRoot: 52, rhRoot: 64, intervals: naturalMinorIntervals,
             rhAsc: g1_rhAsc,  lhAsc: g1_lhAsc,
             rhDesc: g1_rhDesc, lhDesc: g1_lhDesc),

    ScaleDef(key: .bNaturalMinor,
             lhRoot: 47, rhRoot: 59, intervals: naturalMinorIntervals,
             rhAsc: g3_rhAsc,  lhAsc: g3_lhAsc,
             rhDesc: g3_rhDesc, lhDesc: g3_lhDesc),

    ScaleDef(key: .fSharpNaturalMinor,
             lhRoot: 42, rhRoot: 54, intervals: naturalMinorIntervals,
             rhAsc: g7_rhAsc,  lhAsc: g4_lhAsc,    // RH different from F# major
             rhDesc: g7_rhDesc, lhDesc: g4_lhDesc),

    ScaleDef(key: .cSharpNaturalMinor,
             lhRoot: 49, rhRoot: 61, intervals: naturalMinorIntervals,
             rhAsc: g7_rhAsc,  lhAsc: g5_lhAsc,    // RH same as F# minor; LH same as C# major
             rhDesc: g7_rhDesc, lhDesc: g5_lhDesc),

    ScaleDef(key: .abNaturalMinor,
             lhRoot: 44, rhRoot: 56, intervals: naturalMinorIntervals,
             rhAsc: abMaj_rhAsc,  lhAsc: abMin_lhAsc,  // RH same as Ab major; LH different
             rhDesc: abMaj_rhDesc, lhDesc: abMin_lhDesc),

    ScaleDef(key: .ebNaturalMinor,
             lhRoot: 51, rhRoot: 63, intervals: naturalMinorIntervals,
             rhAsc: ebMaj_rhAsc,  lhAsc: ebMin_lhAsc,  // RH same as Eb major; LH different
             rhDesc: ebMaj_rhDesc, lhDesc: ebMin_lhDesc),

    ScaleDef(key: .bbNaturalMinor,
             lhRoot: 46, rhRoot: 58, intervals: naturalMinorIntervals,
             rhAsc: bbMaj_rhAsc,  lhAsc: bbMin_lhAsc,  // RH same as Bb major; LH different
             rhDesc: bbMaj_rhDesc, lhDesc: bbMin_lhDesc),

    ScaleDef(key: .fNaturalMinor,
             lhRoot: 53, rhRoot: 65, intervals: naturalMinorIntervals,
             rhAsc: g2_rhAsc,  lhAsc: g2_lhAsc,
             rhDesc: g2_rhDesc, lhDesc: g2_lhDesc),
]

// MARK: - Index

private let defsByKey: [KeySignature: ScaleDef] = {
    Dictionary(uniqueKeysWithValues: allDefs.map { ($0.key, $0) })
}()

// MARK: - Public API

/// Library of two-octave scale lessons for all supported keys.
///
/// Call `handsTogetherAscendingDescending(key:)` to get the standard
/// hands-together ascending + descending lesson used by the app.
public enum ScaleLibrary {

    // MARK: - Lesson builders

    /// Returns a hands-together ascending-only lesson (15 steps).
    public static func handsTogetherAscending(key: KeySignature) -> ScaleLesson {
        let d = def(for: key)
        let lh = midiNotes(root: d.lhRoot, intervals: d.intervals)
        let rh = midiNotes(root: d.rhRoot, intervals: d.intervals)
        let steps: [ScaleStep] = (0..<lh.count).map { i in
            ScaleStep(leftNote: lh[i], leftFinger: d.lhAsc[i],
                      rightNote: rh[i], rightFinger: d.rhAsc[i],
                      waitForBothHands: true)
        }
        return ScaleLesson(key: key, direction: .ascending, handsMode: .together, steps: steps)
    }

    /// Returns a hands-together ascending + descending lesson (29 steps).
    /// The turnaround note is played once (as the final ascending step)
    /// and is not repeated in the descending leg.
    public static func handsTogetherAscendingDescending(key: KeySignature) -> ScaleLesson {
        let d = def(for: key)
        let lhAsc = midiNotes(root: d.lhRoot, intervals: d.intervals)
        let rhAsc = midiNotes(root: d.rhRoot, intervals: d.intervals)
        let lhDesc = Array(lhAsc.reversed().dropFirst())
        let rhDesc = Array(rhAsc.reversed().dropFirst())

        precondition(d.rhAsc.count  == rhAsc.count)
        precondition(d.lhDesc.count == lhDesc.count)
        precondition(d.rhDesc.count == rhDesc.count)

        let ascSteps: [ScaleStep] = (0..<lhAsc.count).map { i in
            ScaleStep(leftNote: lhAsc[i], leftFinger: d.lhAsc[i],
                      rightNote: rhAsc[i], rightFinger: d.rhAsc[i],
                      waitForBothHands: true)
        }
        let descSteps: [ScaleStep] = (0..<lhDesc.count).map { i in
            ScaleStep(leftNote: lhDesc[i], leftFinger: d.lhDesc[i],
                      rightNote: rhDesc[i], rightFinger: d.rhDesc[i],
                      waitForBothHands: true)
        }
        return ScaleLesson(key: key, direction: .ascendingDescending,
                           handsMode: .together, steps: ascSteps + descSteps)
    }

    /// Returns a hands-together descending-only lesson (15 steps, apex → root).
    /// Step 0 is the apex note (shared with the ascending turnaround); the
    /// remaining 14 steps descend to the root. Fingers are taken from the
    /// apex ascending finger followed by the standard descending array.
    public static func handsTogetherDescending(key: KeySignature) -> ScaleLesson {
        let d = def(for: key)
        let lhAsc = midiNotes(root: d.lhRoot, intervals: d.intervals)
        let rhAsc = midiNotes(root: d.rhRoot, intervals: d.intervals)
        // Full descent from apex → root (15 notes, apex not dropped).
        let lhDesc = lhAsc.reversed()
        let rhDesc = rhAsc.reversed()
        // Fingering: [apex_asc_finger] + standard 14-note descending array.
        let lhFingers = [d.lhAsc.last!] + d.lhDesc   // 1 + 14 = 15
        let rhFingers = [d.rhAsc.last!] + d.rhDesc   // 1 + 14 = 15
        let steps: [ScaleStep] = (0..<15).map { i in
            ScaleStep(leftNote: lhDesc[lhDesc.index(lhDesc.startIndex, offsetBy: i)],
                      leftFinger: lhFingers[i],
                      rightNote: rhDesc[rhDesc.index(rhDesc.startIndex, offsetBy: i)],
                      rightFinger: rhFingers[i],
                      waitForBothHands: true)
        }
        return ScaleLesson(key: key, direction: .descending, handsMode: .together, steps: steps)
    }

    /// Unified lesson builder — picks ascending, descending, or both based on
    /// `direction`. Use this instead of calling the three specific functions
    /// directly so that `SessionCoordinator` only needs one call site.
    public static func lesson(key: KeySignature, direction: Direction) -> ScaleLesson {
        switch direction {
        case .ascending:            return handsTogetherAscending(key: key)
        case .descending:           return handsTogetherDescending(key: key)
        case .ascendingDescending:  return handsTogetherAscendingDescending(key: key)
        }
    }

    // MARK: - Private helpers

    private static func def(for key: KeySignature) -> ScaleDef {
        guard let d = defsByKey[key] else {
            preconditionFailure("ScaleLibrary: no definition for \(key)")
        }
        return d
    }

    private static func midiNotes(root: Int, intervals: [Int]) -> [Int] {
        intervals.map { root + $0 }
    }
}
