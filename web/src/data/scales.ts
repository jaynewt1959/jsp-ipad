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

function buildMidi(root: number, asc: number[]): number[] {
  // 15 ascending notes + 14 descending (apex not repeated)
  const desc = asc.slice(0, -1).reverse();
  return [...asc.map(i => root + i), ...desc.map(i => root + i)];
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
  { label: "C",   majorKey: "cMajor",      minorKey: "cNaturalMinor" },
  { label: "C\u266F", majorKey: "cSharpMajor", minorKey: "cSharpNaturalMinor" },
  { label: "D",   majorKey: "dMajor",      minorKey: "dNaturalMinor" },
  { label: "E\u266D", majorKey: "ebMajor",     minorKey: "ebNaturalMinor" },
  { label: "E",   majorKey: "eMajor",      minorKey: "eNaturalMinor" },
  { label: "F",   majorKey: "fMajor",      minorKey: "fNaturalMinor" },
  { label: "F\u266F", majorKey: "fSharpMajor", minorKey: "fSharpNaturalMinor" },
  { label: "G",   majorKey: "gMajor",      minorKey: "gNaturalMinor" },
  { label: "A\u266D", majorKey: "abMajor",     minorKey: "abNaturalMinor" },
  { label: "A",   majorKey: "aMajor",      minorKey: "aNaturalMinor" },
  { label: "B\u266D", majorKey: "bbMajor",     minorKey: "bbNaturalMinor" },
  { label: "B",   majorKey: "bMajor",      minorKey: "bNaturalMinor" },
] as const;
