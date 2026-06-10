// scales.ts — client-side scale descriptor table.
//
// Mirrors Sources/Lesson/ScaleLibrary.swift.  Each descriptor holds:
//   imagePath   — path to the cleaned score PNG in web/public/scores/
//   rhMidi      — 29 RH MIDI notes (15 ascending + 14 descending)
//   lhMidi      — 29 LH MIDI notes
//   rhFingers   — 29 RH finger numbers
//   lhFingers   — 29 LH finger numbers
//   label       — human-readable name shown in the UI
//
// NOTE: If ScaleLibrary.swift fingering data changes, update here too.

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

const MAJOR_ASC   = [0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
const MINOR_ASC   = [0,2,3,5,7,8,10,12,14,15,17,19,20,22,24];
const HARMONIC_ASC = [0,2,3,5,7,8,11,12,14,15,17,19,20,23,24];
const MELODIC_ASC  = [0,2,3,5,7,9,11,12,14,15,17,19,21,23,24];
// Melodic minor descends as the natural minor: 14 offsets, apex−1 → root.
const MELODIC_DESC_OFFSETS = [22,20,19,17,15,14,12,10,8,7,5,3,2,0];

function buildMidi(root: number, asc: number[]): number[] {
  // 15 ascending notes + 14 descending (apex not repeated)
  const desc = asc.slice(0, -1).reverse();
  return [...asc.map(i => root + i), ...desc.map(i => root + i)];
}

// Melodic minor: ascending uses `asc`, descending uses `descOffsets` (the
// natural-minor form) rather than reversing the ascending notes. 29 values.
function buildMidiMelodic(root: number, asc: number[], descOffsets: number[]): number[] {
  return [...asc.map(i => root + i), ...descOffsets.map(i => root + i)];
}

// ---------------------------------------------------------------------------
// Shared finger arrays  (29 values = 15 ascending + 14 descending)
// Must match the Swift ScaleLibrary groups exactly.
// ---------------------------------------------------------------------------

// Group 1: C G D A E  major/minor
const G1_RH = [1,2,3,1,2,3,4,1,2,3,1,2,3,4,5,  4,3,2,1,3,2,1,4,3,2,1,3,2,1];
const G1_LH = [5,4,3,2,1,3,2,1,4,3,2,1,3,2,1,  2,3,1,2,3,4,1,2,3,1,2,3,4,5];

// Group 2: F major/minor
const G2_RH = [1,2,3,4,1,2,3,1,2,3,4,1,2,3,4,  3,2,1,4,3,2,1,3,2,1,4,3,2,1];
const G2_LH = G1_LH;

// Group 3: B major/minor  (different LH)
const G3_RH = G1_RH;
const G3_LH = [4,3,2,1,4,3,2,1,3,2,1,4,3,2,1,  2,3,4,1,2,3,1,2,3,4,1,2,3,4];

// Group 4: F# major  (RH starts finger 2)
const G4_RH = [2,3,4,1,2,3,1,2,3,4,1,2,3,1,2,  1,3,2,1,4,3,2,1,3,2,1,4,3,2];
const G4_LH = [4,3,2,1,3,2,1,4,3,2,1,3,2,1,4,  1,2,3,1,2,3,4,1,2,3,1,2,3,4];

// Group 5: C# major
const G5_RH = [2,3,1,2,3,4,1,2,3,1,2,3,4,1,2,  1,4,3,2,1,3,2,1,4,3,2,1,3,2];
const G5_LH = [3,2,1,4,3,2,1,3,2,1,4,3,2,1,3,  1,2,3,4,1,2,3,1,2,3,4,1,2,3];

// Group 6 shared LH: Ab Eb Bb major
const G6_LH = G5_LH;

// Ab major
const AB_MAJ_RH = [3,4,1,2,3,1,2,3,4,1,2,3,1,2,3,  2,1,3,2,1,4,3,2,1,3,2,1,4,3];
// Eb major
const EB_MAJ_RH = [3,1,2,3,4,1,2,3,1,2,3,4,1,2,3,  2,1,4,3,2,1,3,2,1,4,3,2,1,3];
// Bb major
const BB_MAJ_RH = [4,1,2,3,1,2,3,4,1,2,3,1,2,3,4,  3,2,1,3,2,1,4,3,2,1,3,2,1,4];

// Group 7: F# natural minor (RH = same as Ab major)
const G7_RH = AB_MAJ_RH;

// Ab natural minor (different LH from Ab major)
const AB_MIN_LH = [3,2,1,3,2,1,4,3,2,1,3,2,1,4,3,  4,1,2,3,1,2,3,4,1,2,3,1,2,3];

// Eb natural minor (different LH from Eb major)
const EB_MIN_LH = [2,1,4,3,2,1,3,2,1,4,3,2,1,2,3,  2,1,2,3,4,1,2,3,1,2,3,4,1,2];

// Bb natural minor (different LH from Bb major)
const BB_MIN_LH = [2,1,3,2,1,4,3,2,1,3,2,1,4,3,2,  3,4,1,2,3,1,2,3,4,1,2,3,1,2];

// ---------------------------------------------------------------------------
// Descriptor type
// ---------------------------------------------------------------------------

export interface ScaleDescriptor {
  key:        string;
  label:      string;
  imagePath:  string;
  rhMidi:     number[];   // 29 values
  lhMidi:     number[];   // 29 values
  rhFingers:  number[];   // 29 values
  lhFingers:  number[];   // 29 values
  /** Per-scale notehead x-centres in VB coords (29 values). */
  rhX?:       number[];
  /** Per-scale RH notehead y-centres in VB coords (29 values). */
  rhY?:       number[];
  /** Per-scale LH notehead y-centres in VB coords (29 values).
   *  x positions are shared with rhX. */
  lhY?:       number[];
}

// ---------------------------------------------------------------------------
// All 24 descriptors
// ---------------------------------------------------------------------------

const DESCRIPTORS: ScaleDescriptor[] = [

  // ── MAJOR ─────────────────────────────────────────────────────────────────

  { key: "cMajor",      label: "C Major",
    imagePath: "/scores/major/C_major.png",
    rhMidi: buildMidi(60, MAJOR_ASC), lhMidi: buildMidi(48, MAJOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [191, 231, 271, 312, 352, 394, 435, 475, 535, 580, 623, 666, 710, 750, 794, 835, 904, 947, 991, 1033, 1075, 1117, 1159, 1202, 1263, 1306, 1346, 1387, 1429],
    rhY: [178, 170, 164, 155, 148, 141, 133, 126, 118, 111, 104, 97, 90, 84, 75, 82, 90, 98, 105, 112, 118, 127, 133, 141, 149, 155, 163, 171, 178],
    lhY: [337, 330, 321, 317, 307, 302, 294, 285, 171, 164, 156, 149, 142, 136, 127, 133, 141, 149, 155, 164, 171, 178, 185, 193, 308, 315, 322, 330, 337] },

  { key: "cSharpMajor", label: "C\u266F Major",
    imagePath: "/scores/major/Csharp_major.png",
    rhMidi: buildMidi(61, MAJOR_ASC), lhMidi: buildMidi(49, MAJOR_ASC),
    rhFingers: G5_RH, lhFingers: G5_LH,
    rhX: [317, 355, 392, 429, 467, 503, 539, 577, 635, 675, 713, 752, 791, 829, 868, 909, 973, 1009, 1046, 1086, 1121, 1159, 1196, 1233, 1297, 1332, 1367, 1404, 1440],
    rhY: [176, 169, 163, 155, 149, 140, 134, 126, 118, 112, 105, 98, 90, 83, 75, 83, 90, 97, 105, 111, 119, 125, 134, 140, 149, 155, 162, 169, 178],
    lhY: [337, 329, 321, 312, 307, 301, 294, 285, 169, 163, 156, 149, 142, 134, 127, 134, 142, 148, 154, 163, 170, 178, 186, 192, 308, 314, 321, 329, 336] },

  { key: "dMajor",      label: "D Major",
    imagePath: "/scores/major/D_major.png",
    rhMidi: buildMidi(62, MAJOR_ASC), lhMidi: buildMidi(50, MAJOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [239, 277, 318, 356, 397, 436, 477, 515, 578, 619, 660, 699, 743, 782, 824, 864, 933, 974, 1011, 1051, 1091, 1131, 1171, 1210, 1272, 1312, 1352, 1392, 1431],
    rhY: [169, 161, 154, 149, 140, 133, 126, 118, 113, 104, 97, 90, 82, 76, 67, 75, 84, 88, 95, 105, 111, 119, 125, 133, 140, 149, 155, 162, 169],
    lhY: [330, 322, 315, 307, 300, 293, 285, 278, 164, 155, 149, 142, 136, 126, 122, 127, 134, 141, 148, 155, 162, 170, 178, 185, 299, 305, 314, 322, 328] },

  { key: "ebMajor",     label: "E\u266D Major",
    imagePath: "/scores/major/Eflat_major.png",
    rhMidi: buildMidi(63, MAJOR_ASC), lhMidi: buildMidi(51, MAJOR_ASC),
    rhFingers: EB_MAJ_RH, lhFingers: G6_LH,
    rhX: [255, 296, 334, 375, 413, 453, 492, 531, 591, 633, 672, 714, 757, 797, 839, 879, 946, 987, 1027, 1065, 1105, 1145, 1186, 1222, 1283, 1322, 1359, 1398, 1439],
    rhY: [163, 155, 149, 141, 134, 127, 119, 111, 106, 99, 89, 84, 77, 69, 60, 69, 75, 84, 90, 97, 106, 112, 119, 127, 134, 140, 148, 156, 164],
    lhY: [321, 315, 307, 301, 293, 285, 277, 272, 157, 149, 141, 131, 128, 118, 113, 121, 127, 133, 139, 148, 155, 162, 170, 177, 293, 299, 306, 313, 321] },

  { key: "eMajor",      label: "E Major",
    imagePath: "/scores/major/E_major.png",
    rhMidi: buildMidi(64, MAJOR_ASC), lhMidi: buildMidi(52, MAJOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [270, 307, 348, 385, 425, 463, 501, 540, 599, 640, 679, 721, 760, 799, 840, 881, 942, 981, 1020, 1059, 1099, 1138, 1178, 1215, 1278, 1318, 1355, 1393, 1435],
    rhY: [165, 154, 149, 142, 134, 126, 119, 111, 107, 97, 91, 84, 75, 69, 62, 69, 74, 83, 90, 96, 105, 111, 118, 125, 133, 140, 149, 155, 163],
    lhY: [323, 314, 307, 301, 293, 283, 277, 270, 157, 148, 140, 135, 126, 118, 113, 121, 127, 135, 143, 149, 156, 162, 170, 176, 292, 300, 306, 313, 321] },

  { key: "fMajor",      label: "F Major",
    imagePath: "/scores/major/F_major.png",
    rhMidi: buildMidi(65, MAJOR_ASC), lhMidi: buildMidi(53, MAJOR_ASC),
    rhFingers: G2_RH, lhFingers: G2_LH,
    rhX: [221, 262, 304, 343, 382, 424, 465, 503, 565, 609, 651, 692, 735, 776, 821, 862, 931, 970, 1011, 1052, 1091, 1132, 1173, 1214, 1275, 1315, 1355, 1394, 1434],
    rhY: [156, 149, 141, 135, 126, 118, 110, 105, 98, 90, 84, 77, 69, 61, 54, 61, 69, 75, 83, 89, 98, 105, 112, 119, 128, 134, 142, 148, 157],
    lhY: [314, 308, 300, 292, 286, 277, 272, 263, 150, 140, 137, 129, 119, 112, 107, 111, 118, 127, 135, 142, 149, 155, 166, 170, 283, 292, 299, 305, 313] },

  { key: "fSharpMajor", label: "F\u266F Major",
    imagePath: "/scores/major/Fsharp_major.png",
    rhMidi: buildMidi(54, MAJOR_ASC), lhMidi: buildMidi(42, MAJOR_ASC),
    rhFingers: G4_RH, lhFingers: G4_LH,
    rhX: [307, 344, 381, 417, 457, 493, 530, 567, 629, 669, 706, 745, 784, 820, 858, 896, 956, 997, 1033, 1071, 1109, 1148, 1189, 1225, 1284, 1323, 1360, 1399, 1433],
    rhY: [156, 148, 141, 134, 126, 119, 111, 106, 98, 91, 82, 76, 67, 59, 54, 58, 67, 74, 84, 88, 95, 106, 111, 118, 126, 131, 141, 147, 155],
    lhY: [313, 307, 298, 291, 284, 277, 268, 265, 149, 142, 134, 127, 119, 112, 106, 111, 118, 125, 132, 141, 148, 154, 162, 169, 285, 291, 301, 308, 315] },

  { key: "gMajor",      label: "G Major",
    imagePath: "/scores/major/G_major.png",
    rhMidi: buildMidi(55, MAJOR_ASC), lhMidi: buildMidi(43, MAJOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [228, 269, 311, 349, 390, 432, 473, 513, 577, 618, 659, 697, 736, 777, 818, 857, 919, 959, 1001, 1041, 1082, 1123, 1162, 1203, 1263, 1305, 1347, 1387, 1428],
    rhY: [197, 192, 183, 177, 169, 163, 155, 149, 140, 134, 127, 118, 111, 103, 97, 104, 112, 119, 127, 134, 139, 148, 155, 161, 168, 178, 185, 193, 200],
    lhY: [359, 347, 342, 336, 328, 322, 314, 309, 193, 186, 178, 169, 162, 154, 149, 155, 164, 171, 179, 185, 193, 199, 207, 214, 328, 336, 343, 350, 360] },

  { key: "abMajor",     label: "A\u266D Major",
    imagePath: "/scores/major/Aflat_major.png",
    rhMidi: buildMidi(56, MAJOR_ASC), lhMidi: buildMidi(44, MAJOR_ASC),
    rhFingers: AB_MAJ_RH, lhFingers: G6_LH,
    rhX: [275, 313, 353, 391, 431, 469, 506, 545, 610, 650, 687, 725, 763, 802, 840, 878, 937, 980, 1015, 1055, 1095, 1137, 1176, 1219, 1278, 1314, 1357, 1392, 1433],
    rhY: [192, 183, 180, 172, 163, 157, 148, 141, 135, 126, 119, 112, 105, 99, 89, 96, 103, 112, 119, 128, 133, 141, 148, 155, 162, 169, 177, 184, 192],
    lhY: [349, 343, 336, 329, 321, 313, 306, 302, 186, 179, 169, 160, 155, 149, 142, 148, 155, 163, 170, 176, 182, 191, 199, 207, 322, 329, 335, 343, 350] },

  { key: "aMajor",      label: "A Major",
    imagePath: "/scores/major/A_major.png",
    rhMidi: buildMidi(57, MAJOR_ASC), lhMidi: buildMidi(45, MAJOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [259, 299, 336, 377, 416, 455, 494, 535, 597, 638, 678, 717, 753, 792, 831, 873, 936, 976, 1016, 1056, 1094, 1133, 1171, 1209, 1265, 1307, 1350, 1390, 1432],
    rhY: [193, 184, 179, 171, 164, 155, 149, 141, 134, 127, 119, 112, 104, 96, 90, 97, 106, 111, 117, 126, 133, 142, 147, 156, 163, 168, 176, 186, 193],
    lhY: [350, 342, 336, 329, 321, 313, 307, 300, 183, 179, 172, 164, 155, 148, 141, 148, 157, 166, 171, 176, 184, 193, 200, 207, 321, 329, 336, 341, 349] },

  { key: "bbMajor",     label: "B\u266D Major",
    imagePath: "/scores/major/Bflat_major.png",
    rhMidi: buildMidi(58, MAJOR_ASC), lhMidi: buildMidi(46, MAJOR_ASC),
    rhFingers: BB_MAJ_RH, lhFingers: G6_LH,
    rhX: [241, 280, 319, 360, 401, 438, 477, 515, 585, 625, 662, 703, 744, 782, 824, 864, 926, 964, 1006, 1048, 1088, 1131, 1171, 1211, 1271, 1311, 1352, 1391, 1432],
    rhY: [186, 178, 171, 163, 156, 149, 141, 135, 125, 120, 113, 106, 97, 89, 84, 90, 96, 106, 112, 119, 126, 134, 141, 149, 155, 163, 171, 178, 184],
    lhY: [343, 339, 330, 320, 314, 307, 300, 292, 177, 167, 164, 156, 149, 143, 138, 143, 151, 158, 163, 169, 178, 185, 192, 201, 313, 323, 333, 337, 342] },

  { key: "bMajor",      label: "B Major",
    imagePath: "/scores/major/B_major.png",
    rhMidi: buildMidi(59, MAJOR_ASC), lhMidi: buildMidi(47, MAJOR_ASC),
    rhFingers: G3_RH, lhFingers: G3_LH,
    rhX: [286, 322, 363, 402, 438, 476, 515, 552, 611, 652, 690, 731, 775, 813, 854, 896, 960, 997, 1038, 1074, 1114, 1152, 1187, 1225, 1287, 1326, 1361, 1399, 1437],
    rhY: [186, 178, 169, 164, 156, 148, 141, 134, 124, 118, 111, 105, 98, 90, 84, 89, 97, 104, 112, 120, 125, 132, 139, 147, 156, 162, 168, 178, 185],
    lhY: [341, 332, 326, 321, 315, 308, 301, 294, 179, 169, 162, 155, 150, 140, 134, 141, 148, 156, 164, 170, 181, 188, 193, 201, 313, 321, 328, 336, 341] },

  // ── NATURAL MINOR ─────────────────────────────────────────────────────────

  { key: "cNaturalMinor",      label: "C Natural Minor",
    imagePath: "/scores/natural_minor/C_natural_minor.png",
    rhMidi: buildMidi(60, MINOR_ASC), lhMidi: buildMidi(48, MINOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [258, 296, 331, 370, 410, 448, 489, 528, 588, 626, 670, 710, 750, 789, 831, 873, 937, 980, 1019, 1059, 1098, 1138, 1179, 1218, 1281, 1319, 1360, 1397, 1436],
    rhY: [177, 170, 164, 154, 149, 142, 136, 126, 118, 111, 107, 97, 92, 84, 75, 82, 91, 97, 104, 112, 120, 126, 134, 139, 148, 156, 162, 169, 177],
    lhY: [336, 329, 322, 315, 308, 300, 292, 285, 170, 162, 155, 148, 141, 133, 125, 133, 141, 148, 155, 163, 171, 178, 184, 192, 308, 313, 321, 328, 335] },

  { key: "cSharpNaturalMinor", label: "C\u266F Natural Minor",
    imagePath: "/scores/natural_minor/Csharp_natural_minor.png",
    rhMidi: buildMidi(61, MINOR_ASC), lhMidi: buildMidi(49, MINOR_ASC),
    rhFingers: G7_RH, lhFingers: G5_LH,
    rhX: [270, 310, 347, 386, 424, 465, 498, 538, 598, 639, 679, 719, 757, 798, 838, 877, 943, 983, 1021, 1061, 1101, 1141, 1179, 1219, 1280, 1318, 1357, 1397, 1434],
    rhY: [177, 170, 163, 155, 149, 140, 135, 126, 118, 113, 105, 98, 90, 82, 75, 83, 90, 96, 106, 112, 118, 124, 134, 141, 148, 155, 162, 170, 178],
    lhY: [335, 326, 321, 313, 306, 298, 293, 283, 168, 165, 155, 146, 139, 135, 126, 133, 140, 150, 156, 165, 169, 178, 185, 192, 306, 313, 321, 328, 337] },

  { key: "dNaturalMinor",      label: "D Natural Minor",
    imagePath: "/scores/natural_minor/D_natural_minor.png",
    rhMidi: buildMidi(62, MINOR_ASC), lhMidi: buildMidi(50, MINOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [222, 261, 301, 341, 384, 421, 460, 502, 565, 606, 647, 689, 732, 774, 816, 859, 927, 968, 1009, 1048, 1091, 1131, 1172, 1215, 1275, 1315, 1353, 1396, 1435],
    rhY: [172, 164, 157, 149, 140, 132, 126, 120, 111, 104, 97, 92, 84, 75, 68, 76, 83, 90, 97, 105, 110, 119, 125, 134, 142, 149, 156, 164, 170],
    lhY: [330, 321, 310, 308, 300, 293, 284, 279, 164, 156, 149, 142, 136, 128, 118, 125, 134, 141, 150, 155, 162, 171, 178, 185, 299, 309, 313, 321, 330] },

  { key: "ebNaturalMinor",     label: "E\u266D Natural Minor",
    imagePath: "/scores/natural_minor/Eflat_natural_minor.png",
    rhMidi: buildMidi(63, MINOR_ASC), lhMidi: buildMidi(51, MINOR_ASC),
    rhFingers: EB_MAJ_RH, lhFingers: EB_MIN_LH,
    rhX: [292, 327, 366, 408, 444, 483, 520, 559, 618, 658, 696, 737, 776, 815, 856, 893, 961, 1001, 1036, 1074, 1112, 1151, 1189, 1226, 1288, 1325, 1360, 1398, 1439],
    rhY: [162, 156, 149, 141, 134, 126, 120, 111, 104, 97, 90, 83, 76, 69, 60, 68, 75, 83, 89, 96, 104, 112, 120, 127, 135, 140, 148, 154, 162],
    lhY: [319, 315, 307, 300, 297, 290, 279, 270, 158, 150, 141, 135, 127, 119, 112, 119, 127, 134, 142, 149, 157, 162, 170, 178, 292, 301, 308, 314, 321] },

  { key: "eNaturalMinor",      label: "E Natural Minor",
    imagePath: "/scores/natural_minor/E_natural_minor.png",
    rhMidi: buildMidi(64, MINOR_ASC), lhMidi: buildMidi(52, MINOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [219, 260, 302, 340, 380, 421, 461, 505, 564, 606, 650, 694, 732, 777, 819, 860, 929, 971, 1010, 1050, 1092, 1130, 1174, 1211, 1272, 1315, 1353, 1393, 1431],
    rhY: [163, 156, 151, 143, 134, 128, 118, 113, 105, 98, 89, 84, 75, 68, 62, 68, 76, 84, 91, 96, 104, 112, 119, 126, 134, 141, 149, 155, 164],
    lhY: [323, 315, 305, 299, 292, 285, 281, 272, 156, 148, 139, 134, 125, 119, 111, 118, 126, 133, 141, 148, 155, 163, 171, 178, 292, 301, 308, 315, 322] },

  { key: "fNaturalMinor",      label: "F Natural Minor",
    imagePath: "/scores/natural_minor/F_natural_minor.png",
    rhMidi: buildMidi(65, MINOR_ASC), lhMidi: buildMidi(53, MINOR_ASC),
    rhFingers: G2_RH, lhFingers: G2_LH,
    rhX: [261, 299, 340, 379, 418, 457, 497, 534, 594, 637, 678, 720, 757, 802, 840, 881, 948, 988, 1026, 1066, 1106, 1144, 1183, 1223, 1287, 1324, 1362, 1399, 1438],
    rhY: [209, 199, 193, 184, 178, 169, 163, 153, 149, 142, 134, 127, 120, 109, 104, 111, 118, 125, 134, 141, 148, 154, 163, 170, 177, 183, 193, 198, 206],
    lhY: [363, 357, 351, 341, 335, 328, 321, 313, 199, 193, 185, 176, 171, 162, 154, 162, 170, 178, 183, 192, 199, 208, 213, 223, 335, 341, 351, 355, 364] },

  { key: "fSharpNaturalMinor", label: "F\u266F Natural Minor",
    imagePath: "/scores/natural_minor/Fsharp_natural_minor.png",
    rhMidi: buildMidi(54, MINOR_ASC), lhMidi: buildMidi(42, MINOR_ASC),
    rhFingers: G7_RH, lhFingers: G4_LH,
    rhX: [251, 290, 329, 369, 408, 447, 486, 525, 585, 629, 669, 709, 753, 794, 836, 878, 945, 982, 1022, 1060, 1098, 1142, 1181, 1218, 1280, 1321, 1358, 1399, 1437],
    rhY: [206, 198, 193, 184, 178, 170, 163, 155, 149, 140, 134, 127, 121, 113, 105, 110, 118, 125, 134, 141, 149, 155, 163, 169, 182, 185, 192, 198, 206],
    lhY: [365, 359, 352, 345, 337, 330, 320, 314, 306, 300, 294, 286, 279, 272, 264, 271, 276, 284, 291, 300, 307, 315, 323, 328, 336, 343, 350, 358, 364] },

  { key: "gNaturalMinor",      label: "G Natural Minor",
    imagePath: "/scores/natural_minor/G_natural_minor.png",
    rhMidi: buildMidi(55, MINOR_ASC), lhMidi: buildMidi(43, MINOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [242, 280, 321, 362, 400, 439, 481, 521, 588, 624, 665, 704, 743, 782, 820, 861, 921, 962, 1005, 1046, 1088, 1128, 1170, 1211, 1271, 1311, 1352, 1393, 1433],
    rhY: [199, 193, 184, 178, 170, 162, 155, 149, 140, 134, 125, 120, 110, 105, 97, 105, 111, 118, 126, 134, 141, 148, 156, 162, 170, 178, 185, 192, 199],
    lhY: [359, 352, 343, 336, 330, 321, 314, 309, 300, 292, 285, 278, 270, 264, 256, 263, 272, 279, 285, 292, 303, 309, 313, 321, 329, 336, 343, 349, 359] },

  { key: "abNaturalMinor",     label: "A\u266D Natural Minor",
    imagePath: "/scores/natural_minor/Aflat_natural_minor.png",
    rhMidi: buildMidi(56, MINOR_ASC), lhMidi: buildMidi(44, MINOR_ASC),
    rhFingers: AB_MAJ_RH, lhFingers: AB_MIN_LH,
    rhX: [311, 348, 385, 425, 461, 499, 535, 574, 636, 674, 713, 748, 787, 821, 859, 896, 952, 995, 1031, 1074, 1107, 1151, 1189, 1224, 1285, 1322, 1359, 1399, 1436],
    rhY: [193, 184, 178, 168, 163, 154, 148, 138, 132, 126, 119, 112, 105, 98, 89, 95, 104, 112, 118, 124, 135, 141, 149, 155, 161, 168, 177, 184, 188],
    lhY: [350, 346, 335, 328, 320, 314, 305, 299, 186, 177, 171, 164, 156, 148, 140, 148, 154, 163, 169, 177, 185, 192, 198, 206, 316, 331, 333, 343, 352] },

  { key: "aNaturalMinor",      label: "A Natural Minor",
    imagePath: "/scores/natural_minor/A_natural_minor.png",
    rhMidi: buildMidi(57, MINOR_ASC), lhMidi: buildMidi(45, MINOR_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [191, 232, 272, 314, 356, 398, 438, 482, 547, 587, 628, 671, 710, 754, 792, 833, 892, 937, 979, 1023, 1063, 1108, 1152, 1192, 1255, 1300, 1339, 1385, 1425],
    rhY: [203, 194, 188, 179, 170, 167, 159, 151, 144, 136, 130, 121, 114, 107, 100, 107, 113, 120, 130, 135, 143, 150, 157, 164, 173, 180, 188, 194, 203],
    lhY: [342, 335, 326, 317, 311, 306, 297, 291, 191, 186, 181, 173, 165, 159, 152, 158, 166, 173, 181, 187, 195, 201, 210, 218, 311, 319, 327, 334, 342] },

  { key: "bbNaturalMinor",     label: "B\u266D Natural Minor",
    imagePath: "/scores/natural_minor/Bflat_natural_minor.png",
    rhMidi: buildMidi(58, MINOR_ASC), lhMidi: buildMidi(46, MINOR_ASC),
    rhFingers: BB_MAJ_RH, lhFingers: BB_MIN_LH,
    rhX: [282, 318, 359, 399, 435, 473, 512, 549, 616, 652, 693, 729, 770, 808, 847, 886, 946, 983, 1026, 1065, 1102, 1140, 1185, 1218, 1281, 1320, 1356, 1397, 1435],
    rhY: [185, 176, 171, 162, 154, 149, 142, 136, 126, 117, 110, 105, 98, 91, 82, 89, 97, 103, 109, 117, 125, 134, 142, 147, 154, 164, 170, 177, 184],
    lhY: [343, 336, 327, 321, 313, 307, 297, 292, 178, 171, 162, 155, 148, 141, 135, 140, 146, 154, 163, 169, 177, 184, 192, 199, 313, 322, 329, 336, 344] },

  { key: "bNaturalMinor",      label: "B Natural Minor",
    imagePath: "/scores/natural_minor/B_natural_minor.png",
    rhMidi: buildMidi(59, MINOR_ASC), lhMidi: buildMidi(47, MINOR_ASC),
    rhFingers: G3_RH, lhFingers: G3_LH,
    rhX: [244, 277, 315, 355, 397, 433, 477, 515, 579, 623, 665, 701, 747, 783, 821, 862, 923, 965, 1006, 1046, 1089, 1129, 1170, 1208, 1272, 1312, 1351, 1391, 1435],
    rhY: [185, 179, 171, 166, 156, 151, 142, 137, 126, 121, 113, 108, 98, 91, 84, 89, 98, 105, 111, 120, 125, 133, 140, 150, 155, 163, 169, 178, 186],
    lhY: [343, 336, 329, 321, 313, 309, 300, 295, 181, 174, 167, 158, 152, 145, 137, 141, 147, 153, 162, 172, 179, 184, 192, 199, 315, 322, 331, 337, 342] },

  // ── HARMONIC MINOR ────────────────────────────────────────────────
  // Fingering mirrors each key's natural minor. Images are 3000×900.
  { key: "cHarmonicMinor",      label: "C Harmonic Minor",
    imagePath: "/scores/harmonic_minor/C_harmonic_minor.png",
    rhMidi: buildMidi(60, HARMONIC_ASC), lhMidi: buildMidi(48, HARMONIC_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [240, 278, 318, 356, 397, 435, 478, 517, 576, 616, 655, 695, 734, 782, 822, 861, 926, 966, 1005, 1045, 1084, 1122, 1168, 1209, 1270, 1308, 1346, 1385, 1423],
    rhY: [217, 209, 202, 195, 188, 180, 174, 166, 159, 151, 144, 137, 129, 122, 115, 122, 129, 137, 145, 151, 159, 165, 172, 179, 188, 194, 202, 210, 217],
    lhY: [375, 369, 360, 355, 346, 339, 332, 325, 211, 202, 196, 189, 181, 172, 166, 174, 182, 188, 196, 203, 211, 216, 222, 232, 346, 354, 361, 368, 376] },

  { key: "cSharpHarmonicMinor", label: "C\u266F Harmonic Minor",
    imagePath: "/scores/harmonic_minor/Csharp_harmonic_minor.png",
    rhMidi: buildMidi(61, HARMONIC_ASC), lhMidi: buildMidi(49, HARMONIC_ASC),
    rhFingers: G7_RH, lhFingers: G5_LH,
    rhX: [257, 295, 333, 372, 410, 447, 493, 531, 589, 628, 669, 706, 744, 793, 831, 871, 934, 973, 1010, 1050, 1088, 1125, 1174, 1213, 1273, 1311, 1348, 1387, 1424],
    rhY: [201, 193, 188, 179, 172, 165, 158, 150, 143, 136, 129, 121, 113, 106, 99, 107, 113, 120, 129, 135, 142, 150, 158, 164, 173, 178, 186, 194, 201],
    lhY: [358, 351, 345, 338, 331, 325, 317, 309, 195, 187, 179, 172, 164, 157, 151, 158, 165, 172, 178, 187, 194, 202, 208, 215, 331, 338, 344, 351, 359] },

  { key: "dHarmonicMinor",      label: "D Harmonic Minor",
    imagePath: "/scores/harmonic_minor/D_harmonic_minor.png",
    rhMidi: buildMidi(62, HARMONIC_ASC), lhMidi: buildMidi(50, HARMONIC_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [207, 247, 287, 328, 367, 407, 452, 493, 555, 595, 636, 677, 716, 767, 809, 849, 914, 956, 997, 1036, 1077, 1117, 1163, 1204, 1266, 1304, 1343, 1382, 1422],
    rhY: [208, 200, 193, 188, 179, 171, 165, 157, 150, 143, 136, 129, 122, 114, 107, 116, 121, 128, 136, 144, 150, 158, 165, 172, 179, 186, 194, 200, 210],
    lhY: [367, 360, 352, 346, 339, 331, 324, 318, 202, 195, 188, 180, 173, 165, 158, 164, 173, 180, 188, 194, 201, 209, 216, 224, 339, 347, 353, 360, 369] },

  { key: "ebHarmonicMinor",     label: "E\u266D Harmonic Minor",
    imagePath: "/scores/harmonic_minor/Eflat_harmonic_minor.png",
    rhMidi: buildMidi(63, HARMONIC_ASC), lhMidi: buildMidi(51, HARMONIC_ASC),
    rhFingers: EB_MAJ_RH, lhFingers: EB_MIN_LH,
    rhX: [278, 314, 353, 390, 428, 465, 512, 550, 608, 647, 685, 723, 763, 808, 848, 888, 950, 988, 1026, 1063, 1101, 1141, 1182, 1221, 1280, 1316, 1352, 1388, 1426],
    rhY: [199, 193, 186, 177, 170, 163, 157, 149, 141, 134, 127, 120, 112, 104, 98, 103, 111, 117, 125, 134, 141, 147, 155, 162, 170, 177, 183, 192, 199],
    lhY: [357, 349, 343, 336, 328, 321, 313, 306, 193, 185, 178, 171, 163, 156, 149, 155, 162, 170, 177, 185, 193, 198, 206, 215, 328, 336, 342, 351, 358] },

  { key: "eHarmonicMinor",      label: "E Harmonic Minor",
    imagePath: "/scores/harmonic_minor/E_harmonic_minor.png",
    rhMidi: buildMidi(64, HARMONIC_ASC), lhMidi: buildMidi(52, HARMONIC_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [205, 245, 284, 326, 364, 404, 453, 495, 555, 595, 637, 679, 721, 770, 812, 855, 919, 961, 1001, 1042, 1082, 1122, 1167, 1206, 1268, 1306, 1344, 1384, 1422],
    rhY: [201, 195, 186, 179, 172, 165, 158, 150, 142, 135, 129, 122, 113, 107, 99, 106, 113, 121, 128, 135, 142, 150, 157, 164, 171, 179, 187, 193, 200],
    lhY: [361, 351, 345, 337, 330, 323, 316, 309, 194, 186, 178, 172, 163, 158, 150, 158, 165, 173, 179, 188, 193, 199, 208, 216, 328, 338, 345, 353, 359] },

  { key: "fHarmonicMinor",      label: "F Harmonic Minor",
    imagePath: "/scores/harmonic_minor/F_harmonic_minor.png",
    rhMidi: buildMidi(65, HARMONIC_ASC), lhMidi: buildMidi(53, HARMONIC_ASC),
    rhFingers: G2_RH, lhFingers: G2_LH,
    rhX: [251, 290, 331, 371, 408, 447, 490, 529, 591, 631, 670, 709, 746, 790, 827, 866, 925, 962, 1003, 1042, 1081, 1121, 1167, 1205, 1268, 1308, 1345, 1384, 1421],
    rhY: [225, 218, 211, 203, 196, 188, 182, 173, 167, 159, 152, 146, 138, 130, 122, 129, 137, 145, 152, 159, 167, 173, 181, 188, 196, 202, 210, 218, 226],
    lhY: [383, 376, 369, 361, 354, 347, 339, 333, 218, 211, 203, 196, 188, 181, 174, 181, 189, 195, 202, 211, 219, 225, 233, 240, 354, 362, 369, 375, 384] },

  { key: "fSharpHarmonicMinor", label: "F\u266F Harmonic Minor",
    imagePath: "/scores/harmonic_minor/Fsharp_harmonic_minor.png",
    rhMidi: buildMidi(54, HARMONIC_ASC), lhMidi: buildMidi(42, HARMONIC_ASC),
    rhFingers: G7_RH, lhFingers: G4_LH,
    rhX: [241, 280, 320, 360, 401, 438, 484, 523, 582, 621, 659, 698, 738, 787, 825, 866, 928, 966, 1006, 1043, 1082, 1119, 1163, 1202, 1266, 1304, 1342, 1380, 1421],
    rhY: [242, 235, 228, 220, 213, 206, 200, 192, 184, 176, 169, 161, 155, 147, 139, 146, 155, 161, 169, 176, 184, 190, 199, 206, 212, 219, 227, 234, 242],
    lhY: [399, 392, 386, 379, 370, 364, 357, 349, 341, 335, 328, 321, 314, 307, 299, 307, 313, 320, 327, 334, 341, 350, 358, 365, 370, 378, 385, 393, 400] },

  { key: "gHarmonicMinor",      label: "G Harmonic Minor",
    imagePath: "/scores/harmonic_minor/G_harmonic_minor.png",
    rhMidi: buildMidi(55, HARMONIC_ASC), lhMidi: buildMidi(43, HARMONIC_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [223, 265, 305, 343, 384, 424, 471, 509, 569, 609, 648, 688, 730, 779, 819, 859, 923, 964, 1004, 1044, 1081, 1121, 1166, 1207, 1266, 1304, 1343, 1381, 1422],
    rhY: [203, 196, 188, 182, 174, 167, 159, 153, 144, 138, 129, 123, 115, 108, 102, 108, 115, 123, 130, 138, 146, 151, 158, 167, 174, 182, 189, 196, 204],
    lhY: [362, 355, 348, 342, 334, 326, 318, 310, 303, 295, 290, 282, 276, 268, 260, 267, 274, 282, 289, 295, 303, 310, 319, 325, 332, 340, 347, 355, 362] },

  { key: "abHarmonicMinor",     label: "A\u266D Harmonic Minor",
    imagePath: "/scores/harmonic_minor/Aflat_harmonic_minor.png",
    rhMidi: buildMidi(56, HARMONIC_ASC), lhMidi: buildMidi(44, HARMONIC_ASC),
    rhFingers: AB_MAJ_RH, lhFingers: AB_MIN_LH,
    rhX: [295, 335, 373, 411, 446, 483, 527, 564, 625, 664, 700, 736, 772, 815, 853, 888, 948, 983, 1020, 1056, 1094, 1134, 1182, 1221, 1277, 1315, 1352, 1389, 1426],
    rhY: [216, 207, 202, 193, 187, 180, 172, 165, 158, 150, 144, 136, 128, 121, 114, 120, 128, 135, 142, 149, 157, 164, 173, 179, 188, 194, 202, 209, 214],
    lhY: [373, 368, 360, 354, 345, 338, 330, 324, 209, 201, 194, 187, 180, 173, 166, 172, 178, 186, 194, 201, 208, 216, 223, 230, 345, 352, 360, 367, 375] },

  { key: "aHarmonicMinor",      label: "A Harmonic Minor",
    imagePath: "/scores/harmonic_minor/A_harmonic_minor.png",
    rhMidi: buildMidi(57, HARMONIC_ASC), lhMidi: buildMidi(45, HARMONIC_ASC),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [174, 218, 256, 300, 339, 382, 426, 469, 535, 578, 618, 660, 700, 744, 786, 827, 889, 933, 973, 1016, 1057, 1099, 1149, 1191, 1254, 1293, 1335, 1375, 1417],
    rhY: [224, 216, 210, 202, 196, 187, 180, 174, 168, 159, 153, 145, 138, 130, 122, 130, 138, 143, 152, 159, 167, 174, 180, 188, 194, 203, 211, 217, 224],
    lhY: [384, 375, 368, 363, 354, 347, 339, 332, 216, 210, 203, 195, 188, 181, 175, 182, 187, 194, 203, 210, 216, 225, 232, 241, 354, 362, 370, 378, 383] },

  { key: "bbHarmonicMinor",     label: "B\u266D Harmonic Minor",
    imagePath: "/scores/harmonic_minor/Bflat_harmonic_minor.png",
    rhMidi: buildMidi(58, HARMONIC_ASC), lhMidi: buildMidi(46, HARMONIC_ASC),
    rhFingers: BB_MAJ_RH, lhFingers: BB_MIN_LH,
    rhX: [268, 307, 343, 382, 420, 459, 500, 540, 603, 640, 680, 717, 756, 797, 837, 877, 937, 974, 1013, 1050, 1089, 1129, 1176, 1214, 1273, 1311, 1349, 1388, 1425],
    rhY: [217, 211, 204, 197, 189, 182, 174, 167, 160, 153, 145, 138, 132, 123, 116, 123, 130, 137, 144, 152, 159, 167, 174, 180, 188, 196, 202, 211, 217],
    lhY: [376, 368, 361, 353, 345, 339, 333, 324, 211, 203, 195, 189, 183, 173, 167, 174, 183, 189, 196, 202, 211, 218, 227, 233, 347, 350, 361, 363, 375] },

  { key: "bHarmonicMinor",      label: "B Harmonic Minor",
    imagePath: "/scores/harmonic_minor/B_harmonic_minor.png",
    rhMidi: buildMidi(59, HARMONIC_ASC), lhMidi: buildMidi(47, HARMONIC_ASC),
    rhFingers: G3_RH, lhFingers: G3_LH,
    rhX: [226, 266, 306, 345, 384, 423, 468, 509, 573, 612, 652, 691, 731, 775, 817, 857, 917, 957, 996, 1037, 1076, 1116, 1167, 1207, 1268, 1307, 1343, 1382, 1421],
    rhY: [203, 196, 189, 182, 175, 167, 160, 152, 145, 138, 130, 124, 117, 109, 101, 108, 117, 123, 130, 137, 145, 153, 158, 167, 175, 182, 189, 196, 204],
    lhY: [363, 353, 346, 339, 332, 326, 319, 311, 197, 189, 180, 174, 166, 160, 153, 160, 167, 174, 181, 188, 195, 203, 211, 218, 333, 340, 349, 354, 361] },

  // ── MELODIC MINOR ────────────────────────────────────────────────
  // Ascending raised 6/7; descending = natural minor (via buildMidiMelodic).
  { key: "cMelodicMinor",      label: "C Melodic Minor",
    imagePath: "/scores/melodic_minor/C_melodic_minor.png",
    rhMidi: buildMidiMelodic(60, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(48, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [238, 277, 316, 353, 390, 433, 476, 516, 575, 614, 653, 692, 737, 784, 824, 872, 963, 1000, 1038, 1075, 1112, 1149, 1186, 1224, 1282, 1321, 1354, 1393, 1429],
    rhY: [240, 232, 226, 218, 211, 203, 195, 190, 181, 175, 167, 159, 152, 145, 138, 144, 152, 159, 166, 175, 181, 188, 196, 203, 209, 219, 226, 232, 239],
    lhY: [397, 391, 383, 377, 369, 363, 355, 348, 233, 224, 218, 211, 203, 196, 190, 196, 203, 211, 219, 226, 234, 241, 245, 253, 368, 378, 384, 391, 400] },

  { key: "cSharpMelodicMinor", label: "C\u266F Melodic Minor",
    imagePath: "/scores/melodic_minor/Csharp_melodic_minor.png",
    rhMidi: buildMidiMelodic(61, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(49, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G7_RH, lhFingers: G5_LH,
    rhX: [256, 295, 333, 371, 408, 454, 499, 536, 594, 634, 672, 711, 759, 808, 847, 894, 983, 1020, 1055, 1089, 1122, 1158, 1193, 1225, 1281, 1318, 1354, 1390, 1427],
    rhY: [224, 216, 209, 202, 194, 187, 180, 171, 166, 157, 151, 143, 135, 127, 121, 129, 136, 144, 151, 158, 165, 173, 180, 186, 196, 203, 210, 216, 224],
    lhY: [381, 375, 368, 359, 351, 346, 339, 332, 217, 211, 202, 195, 188, 181, 173, 180, 187, 194, 199, 210, 217, 225, 231, 238, 354, 364, 367, 373, 382] },

  { key: "dMelodicMinor",      label: "D Melodic Minor",
    imagePath: "/scores/melodic_minor/D_melodic_minor.png",
    rhMidi: buildMidiMelodic(62, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(50, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [207, 245, 284, 323, 363, 405, 452, 491, 552, 592, 634, 675, 721, 770, 812, 859, 953, 989, 1027, 1065, 1105, 1142, 1181, 1218, 1279, 1316, 1351, 1389, 1427],
    rhY: [203, 196, 189, 181, 173, 167, 159, 152, 144, 138, 130, 124, 116, 109, 102, 108, 116, 123, 131, 137, 145, 152, 161, 167, 174, 182, 189, 196, 204],
    lhY: [362, 354, 347, 342, 335, 326, 318, 313, 196, 189, 181, 176, 167, 160, 153, 160, 167, 174, 181, 189, 197, 203, 211, 217, 334, 339, 348, 355, 362] },

  { key: "ebMelodicMinor",     label: "E\u266D Melodic Minor",
    imagePath: "/scores/melodic_minor/Eflat_melodic_minor.png",
    rhMidi: buildMidiMelodic(63, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(51, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: EB_MAJ_RH, lhFingers: EB_MIN_LH,
    rhX: [277, 314, 348, 384, 421, 466, 511, 548, 604, 643, 679, 718, 763, 811, 849, 896, 985, 1021, 1057, 1093, 1127, 1162, 1197, 1235, 1291, 1326, 1361, 1396, 1430],
    rhY: [198, 190, 184, 177, 170, 162, 155, 147, 141, 132, 126, 118, 111, 104, 96, 102, 110, 118, 125, 132, 139, 145, 153, 161, 170, 177, 182, 189, 197],
    lhY: [360, 351, 345, 337, 329, 322, 316, 309, 191, 184, 178, 170, 162, 155, 147, 155, 162, 170, 177, 183, 191, 197, 206, 214, 330, 336, 343, 353, 359] },

  { key: "eMelodicMinor",      label: "E Melodic Minor",
    imagePath: "/scores/melodic_minor/E_melodic_minor.png",
    rhMidi: buildMidiMelodic(64, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(52, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [206, 244, 282, 321, 359, 405, 454, 497, 556, 596, 637, 678, 728, 778, 819, 868, 961, 998, 1035, 1072, 1109, 1148, 1183, 1221, 1279, 1317, 1352, 1389, 1425],
    rhY: [201, 193, 188, 179, 172, 164, 157, 150, 144, 135, 129, 121, 113, 106, 99, 106, 113, 120, 127, 136, 143, 149, 156, 165, 172, 180, 188, 195, 201],
    lhY: [360, 353, 345, 337, 330, 324, 317, 309, 194, 186, 180, 175, 165, 156, 150, 158, 165, 172, 179, 186, 194, 200, 208, 215, 328, 337, 344, 352, 359] },

  { key: "fMelodicMinor",      label: "F Melodic Minor",
    imagePath: "/scores/melodic_minor/F_melodic_minor.png",
    rhMidi: buildMidiMelodic(65, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(53, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G2_RH, lhFingers: G2_LH,
    rhX: [253, 290, 327, 363, 400, 447, 492, 528, 586, 626, 661, 699, 745, 791, 827, 871, 958, 997, 1034, 1070, 1107, 1144, 1181, 1218, 1280, 1316, 1353, 1390, 1425],
    rhY: [262, 255, 248, 240, 232, 226, 218, 211, 203, 196, 189, 180, 174, 166, 159, 166, 173, 180, 188, 196, 202, 209, 217, 226, 231, 238, 248, 253, 262],
    lhY: [419, 412, 405, 398, 392, 385, 376, 369, 255, 247, 241, 233, 227, 219, 211, 218, 224, 234, 239, 246, 255, 262, 268, 276, 391, 398, 405, 413, 419] },

  { key: "fSharpMelodicMinor", label: "F\u266F Melodic Minor",
    imagePath: "/scores/melodic_minor/Fsharp_melodic_minor.png",
    rhMidi: buildMidiMelodic(54, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(42, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G7_RH, lhFingers: G4_LH,
    rhX: [241, 279, 317, 355, 394, 443, 487, 526, 583, 622, 659, 697, 745, 794, 832, 880, 969, 1005, 1041, 1076, 1112, 1148, 1182, 1221, 1280, 1315, 1352, 1390, 1428],
    rhY: [206, 198, 191, 182, 177, 169, 164, 154, 146, 139, 132, 125, 118, 111, 104, 110, 117, 125, 132, 139, 147, 153, 160, 167, 178, 184, 190, 199, 203],
    lhY: [364, 357, 349, 343, 334, 328, 320, 313, 305, 299, 291, 283, 275, 269, 261, 268, 276, 284, 289, 296, 305, 311, 318, 326, 334, 342, 348, 357, 364] },

  { key: "gMelodicMinor",      label: "G Melodic Minor",
    imagePath: "/scores/melodic_minor/G_melodic_minor.png",
    rhMidi: buildMidiMelodic(55, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(43, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [224, 264, 302, 341, 380, 423, 469, 506, 566, 606, 645, 685, 734, 781, 822, 868, 961, 998, 1034, 1071, 1109, 1146, 1182, 1219, 1278, 1316, 1352, 1389, 1426],
    rhY: [204, 196, 189, 182, 175, 168, 159, 153, 146, 138, 130, 124, 116, 109, 101, 109, 116, 122, 130, 138, 144, 153, 160, 168, 174, 182, 189, 196, 204],
    lhY: [362, 355, 348, 340, 333, 325, 318, 311, 303, 296, 290, 283, 276, 268, 260, 267, 274, 281, 290, 296, 303, 311, 318, 326, 333, 339, 348, 354, 360] },

  { key: "abMelodicMinor",     label: "A\u266D Melodic Minor",
    imagePath: "/scores/melodic_minor/Aflat_melodic_minor.png",
    rhMidi: buildMidiMelodic(56, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(44, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: AB_MAJ_RH, lhFingers: AB_MIN_LH,
    rhX: [296, 334, 372, 406, 441, 483, 526, 561, 622, 660, 694, 729, 772, 817, 852, 900, 987, 1022, 1057, 1092, 1129, 1163, 1199, 1235, 1291, 1327, 1359, 1396, 1435],
    rhY: [216, 209, 203, 194, 187, 180, 173, 165, 159, 151, 144, 136, 129, 122, 114, 120, 129, 135, 143, 149, 158, 165, 172, 179, 187, 194, 203, 208, 217],
    lhY: [375, 367, 359, 354, 345, 339, 332, 323, 210, 201, 194, 189, 182, 172, 165, 172, 180, 187, 194, 201, 209, 216, 223, 231, 345, 353, 361, 368, 374] },

  { key: "aMelodicMinor",      label: "A Melodic Minor",
    imagePath: "/scores/melodic_minor/A_melodic_minor.png",
    rhMidi: buildMidiMelodic(57, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(45, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G1_RH, lhFingers: G1_LH,
    rhX: [173, 214, 255, 295, 334, 380, 426, 466, 531, 574, 615, 659, 703, 750, 792, 838, 931, 971, 1011, 1051, 1089, 1130, 1169, 1208, 1268, 1306, 1344, 1383, 1422],
    rhY: [252, 245, 238, 230, 224, 216, 209, 201, 195, 187, 180, 172, 165, 158, 151, 158, 166, 172, 180, 187, 193, 199, 208, 216, 224, 230, 238, 244, 252],
    lhY: [410, 403, 396, 390, 382, 375, 368, 361, 245, 238, 231, 224, 215, 209, 201, 209, 217, 222, 230, 237, 244, 252, 260, 266, 380, 390, 396, 403, 411] },

  { key: "bbMelodicMinor",     label: "B\u266D Melodic Minor",
    imagePath: "/scores/melodic_minor/Bflat_melodic_minor.png",
    rhMidi: buildMidiMelodic(58, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(46, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: BB_MAJ_RH, lhFingers: BB_MIN_LH,
    rhX: [268, 305, 341, 377, 414, 457, 501, 537, 598, 635, 674, 709, 754, 799, 837, 884, 974, 1010, 1047, 1082, 1120, 1156, 1193, 1230, 1288, 1323, 1357, 1393, 1430],
    rhY: [217, 209, 202, 196, 188, 181, 174, 166, 158, 151, 144, 138, 129, 122, 115, 122, 129, 136, 143, 152, 159, 166, 172, 180, 188, 195, 202, 210, 216],
    lhY: [376, 367, 360, 354, 347, 340, 332, 325, 211, 203, 195, 187, 182, 175, 165, 172, 182, 187, 195, 203, 211, 217, 225, 231, 346, 356, 360, 367, 376] },

  { key: "bMelodicMinor",      label: "B Melodic Minor",
    imagePath: "/scores/melodic_minor/B_melodic_minor.png",
    rhMidi: buildMidiMelodic(59, MELODIC_ASC, MELODIC_DESC_OFFSETS), lhMidi: buildMidiMelodic(47, MELODIC_ASC, MELODIC_DESC_OFFSETS),
    rhFingers: G3_RH, lhFingers: G3_LH,
    rhX: [227, 266, 303, 342, 379, 426, 471, 508, 571, 610, 651, 690, 734, 780, 822, 869, 960, 997, 1036, 1072, 1110, 1148, 1184, 1223, 1280, 1318, 1352, 1390, 1427],
    rhY: [203, 197, 189, 182, 174, 167, 159, 152, 145, 138, 130, 123, 116, 109, 101, 109, 115, 122, 130, 137, 145, 152, 159, 169, 175, 181, 188, 197, 204],
    lhY: [361, 356, 350, 341, 333, 324, 318, 310, 194, 189, 182, 175, 168, 161, 152, 159, 168, 174, 181, 188, 195, 202, 211, 218, 332, 340, 347, 355, 361] },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const BY_KEY = new Map<string, ScaleDescriptor>(
  DESCRIPTORS.map(d => [d.key, d])
);

/** Returns the descriptor for the given key rawValue, falling back to C major. */
export function getScaleDescriptor(key: string): ScaleDescriptor {
  return BY_KEY.get(key) ?? BY_KEY.get("cMajor")!;
}

/** All 12 key specs used by the scale picker. */
export const KEY_SPECS = [
  { label: "C",   majorKey: "cMajor",      naturalMinorKey: "cNaturalMinor",      harmonicMinorKey: "cHarmonicMinor",      melodicMinorKey: "cMelodicMinor" },
  { label: "C\u266F", majorKey: "cSharpMajor", naturalMinorKey: "cSharpNaturalMinor", harmonicMinorKey: "cSharpHarmonicMinor", melodicMinorKey: "cSharpMelodicMinor" },
  { label: "D",   majorKey: "dMajor",      naturalMinorKey: "dNaturalMinor",      harmonicMinorKey: "dHarmonicMinor",      melodicMinorKey: "dMelodicMinor" },
  { label: "E\u266D", majorKey: "ebMajor",     naturalMinorKey: "ebNaturalMinor",     harmonicMinorKey: "ebHarmonicMinor",     melodicMinorKey: "ebMelodicMinor" },
  { label: "E",   majorKey: "eMajor",      naturalMinorKey: "eNaturalMinor",      harmonicMinorKey: "eHarmonicMinor",      melodicMinorKey: "eMelodicMinor" },
  { label: "F",   majorKey: "fMajor",      naturalMinorKey: "fNaturalMinor",      harmonicMinorKey: "fHarmonicMinor",      melodicMinorKey: "fMelodicMinor" },
  { label: "F\u266F", majorKey: "fSharpMajor", naturalMinorKey: "fSharpNaturalMinor", harmonicMinorKey: "fSharpHarmonicMinor", melodicMinorKey: "fSharpMelodicMinor" },
  { label: "G",   majorKey: "gMajor",      naturalMinorKey: "gNaturalMinor",      harmonicMinorKey: "gHarmonicMinor",      melodicMinorKey: "gMelodicMinor" },
  { label: "A\u266D", majorKey: "abMajor",     naturalMinorKey: "abNaturalMinor",     harmonicMinorKey: "abHarmonicMinor",     melodicMinorKey: "abMelodicMinor" },
  { label: "A",   majorKey: "aMajor",      naturalMinorKey: "aNaturalMinor",      harmonicMinorKey: "aHarmonicMinor",      melodicMinorKey: "aMelodicMinor" },
  { label: "B\u266D", majorKey: "bbMajor",     naturalMinorKey: "bbNaturalMinor",     harmonicMinorKey: "bbHarmonicMinor",     melodicMinorKey: "bbMelodicMinor" },
  { label: "B",   majorKey: "bMajor",      naturalMinorKey: "bNaturalMinor",      harmonicMinorKey: "bHarmonicMinor",      melodicMinorKey: "bMelodicMinor" },
] as const;

// ---------------------------------------------------------------------------
// Minor sub-type helpers (shared by Sidebar, App, and cycleOrders)
// ---------------------------------------------------------------------------

export type MinorVariant = "natural" | "harmonic" | "melodic";

/** The minor sub-type encoded in a scale key, or null for a major key. */
export function minorVariantOf(key: string): MinorVariant | null {
  if (key.includes("Harmonic")) return "harmonic";
  if (key.includes("Melodic"))  return "melodic";
  if (key.includes("Natural"))  return "natural";
  return null;
}

/** True when the key is any minor form (natural, harmonic, or melodic). */
export function isMinorKey(key: string): boolean {
  return minorVariantOf(key) !== null;
}

export type KeySpec = (typeof KEY_SPECS)[number];

/** The KEY_SPECS row matching `key` on any of its fields (falls back to C). */
export function specForKey(key: string): KeySpec {
  return KEY_SPECS.find(s =>
    s.majorKey === key || s.naturalMinorKey === key ||
    s.harmonicMinorKey === key || s.melodicMinorKey === key
  ) ?? KEY_SPECS[0];
}

/** The minor key string for a spec, given the active minor sub-type. */
export function minorKeyFor(spec: KeySpec, variant: MinorVariant): string {
  return variant === "harmonic" ? spec.harmonicMinorKey
       : variant === "melodic"  ? spec.melodicMinorKey
       : spec.naturalMinorKey;
}
