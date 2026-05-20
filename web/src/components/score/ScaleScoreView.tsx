// ScaleScoreView — static-image score with live SVG highlight overlay.
//
// The background is the pre-rendered score image served from
//   web/public/score-cmajor.png
// An SVG with viewBox="0 0 VB_W VB_H" + preserveAspectRatio="none" sits
// on top so every coordinate in this file maps directly to a pixel in
// the image's natural coordinate space.  The whole thing scales to fit
// the panel width while preserving the image's aspect ratio.
//
// ── HOW TO TUNE ──────────────────────────────────────────────────────────────
// If the coloured ellipses are misaligned with the noteheads, adjust the
// CALIBRATION block below.  Open DevTools, inspect the image to find the
// pixel coordinates of a few known noteheads, and update the constants.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
import type { Snapshot, HandStatus } from "../../types";
import type { TimingResult, TimingQuality } from "../../hooks/useTiming";
import { useErrorFlash, type ErrorFlash } from "../../hooks/useErrorFlash";
import { getScaleDescriptor } from "../../data/scales";

// ═══════════════════════════════════════════════════════════════════════════
// CALIBRATION  (all values in the VB_W × VB_H coordinate space)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set to true while tuning note positions.
 * Move your mouse over any notehead — the (x, y) in the VB_W × VB_H
 * coordinate space is shown in the top-left corner of the score.
 * Set back to false when done.
 */
const CALIBRATE = false;

/**
 * Set to true to enter click-to-capture mode (RH then LH, 58 clicks per scale).
 * When done, copy the three output lines and send to the agent.
 */
const CAPTURE_RH_X = false;

/** Logical width/height of the coordinate grid.
 *  VB_W maps to the 3000px image width.  VB_H = 3000 * (900/3000) * (1540/3000)
 *  = 462, giving a perfectly isotropic 1:1 mapping after normalization to
 *  3000 × 900 px score images. */
const VB_W = 1540;
const VB_H = 462;

/**
 * Global shift applied to every highlight ellipse.
 * While CALIBRATE=true, drag the score to adjust these live — the
 * overlay shows the values to copy here when done.
 */
const X_OFFSET = 0;
const Y_OFFSET = 0;

/** y of the 5th (top) treble staff line  →  F5  (pixel 203 / 900 * 462) */
const TREBLE_TOP_Y   = 104;
/** y shift per diatonic half-step (line→space or space→line) in treble */
const TREBLE_STEP_H  = 7.3;

/** y of the 5th (top) bass staff line  →  A3  (pixel 583 / 900 * 462) */
const BASS_TOP_Y     = 299;
/** y shift per diatonic half-step in bass */
const BASS_STEP_H    = 7.3;

/**
 * Exact x centres of each notehead, measured from the score image.
 * RH stems are on the right of the blob; LH stems are on the left,
 * so LH is consistently 16 units left of the matching RH position.
 * 29 values each (steps 0–28).
 */
const RH_X = [
   192,  233,  272,  316,  355,  397,  438,  479,  // bar 1
   541,  584,  625,  668,  712,  753,  797,  840,  // bar 2
   909,  950,  992, 1034, 1077, 1120, 1162, 1204,  // bar 3
  1267, 1308, 1349, 1391, 1429,                    // bar 4
];

/** Highlight ellipse half-axes.  Sized to cover a typical notehead. */
const RX = 13;
const RY = 9;

// ═══════════════════════════════════════════════════════════════════════════
// COLOUR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

const COLOR = {
  leftPast:     "#93c5fd", // blue-300   — already played
  leftFuture:   "#2563eb", // blue-600   — not yet played
  leftCurrent:  "#1e3a8a", // blue-900   — active step
  rightPast:    "#fdba74", // orange-300
  rightFuture:  "#ea580c", // orange-600
  rightCurrent: "#9a3412", // orange-800
  // Timing-aware pressed colours (green → yellow-green → orange).
  pressedOnTime:  "#16a34a", // green-600
  pressedSlightly:"#84cc16", // lime-500
  pressedClearly: "#f97316", // orange-500
  error:        "#e879f9", // fuchsia-400 — wrong note flash (distinct from blue + orange)
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// LESSON MIDI DATA  (mirrors Sources/Lesson/CMajor.swift exactly)
// ═══════════════════════════════════════════════════════════════════════════

// Note positions and finger numbers are now per-scale, looked up via
// getScaleDescriptor() inside the component from snapshot.lesson.key.

// ═══════════════════════════════════════════════════════════════════════════
// POSITION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Diatonic step from C4 (= 0) for any C-major note.
 * Each step is one half-step in the visual staff spacing.
 *   C4=0, D4=1, E4=2, F4=3, G4=4, A4=5, B4=6, C5=7 …
 *   B3=-1, A3=-2, G3=-3 …
 */
function diatonicStep(midi: number): number {
  //          C   Db  D   Eb  E   F   Gb  G   Ab  A   Bb  B
  const map = [0, -1,  1, -1,  2,  3, -1,  4, -1,  5, -1,  6];
  const oct  = Math.floor(midi / 12) - 5; // C4 → oct 0
  return oct * 7 + map[midi % 12];
}

/** y centre of an RH note — always treble staff. */
function rhNoteY(midi: number): number {
  // F5 (step 10) sits at TREBLE_TOP_Y; higher steps → smaller y.
  return TREBLE_TOP_Y + (10 - diatonicStep(midi)) * TREBLE_STEP_H;
}

/**
 * y centre of an LH note.
 *
 * The score image keeps whole bars on one staff (using ledger lines)
 * rather than jumping mid-bar when the hand crosses middle C:
 *   Bar 1  (steps  0-7 ) — all bass  (C4 = ledger line above bass)
 *   Bars 2-3 (steps 8-23) — all treble (B3/A3 = ledger lines below treble)
 *   Bar 4  (steps 24-28) — all bass
 */
function lhNoteY(midi: number, stepIndex: number): number {
  const useBass = stepIndex <= 7 || stepIndex >= 24;
  if (useBass) {
    // A3 (step -2) sits at BASS_TOP_Y; higher steps → smaller y.
    return BASS_TOP_Y + (-2 - diatonicStep(midi)) * BASS_STEP_H;
  }
  // F5 (step 10) sits at TREBLE_TOP_Y; higher steps → smaller y.
  return TREBLE_TOP_Y + (10 - diatonicStep(midi)) * TREBLE_STEP_H;
}

interface NotePos { x: number; y: number }

// ═══════════════════════════════════════════════════════════════════════════
// COLOUR SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns a colour when the note should be visible, null when hidden.
 * Highlights are only shown for:
 *   • the current step’s note while it is physically held correctly (green)
 *   • an error flash on the current step (fuchsia)
 * Everything else — past, future, idle current — stays invisible so
 * the score image is unobstructed.
 */
function pickColor(
  stepIndex: number,
  hand: "left" | "right",
  snapshot: Snapshot | null,
  ef: ErrorFlash | null,
  timingQuality: TimingQuality | null = null,
): string | null {
  const lesson = snapshot?.lesson;
  if (!lesson) return null;

  // Suppress highlights for the inactive hand in single-hand modes.
  if (lesson.handsMode === "leftOnly"  && hand === "right") return null;
  if (lesson.handsMode === "rightOnly" && hand === "left")  return null;

  const status: HandStatus | undefined =
    hand === "left" ? snapshot?.handStatus.left : snapshot?.handStatus.right;

  // Error flash takes priority.
  if (ef?.hand === hand && stepIndex === ef.atStepIndex) return COLOR.error;

  // Green: the confirmed / pre-pressed step while it is physically held.
  const cur = lesson.displayStepIndex;
  if (stepIndex === cur) {
    if (status?.kind === "correct" || status?.kind === "waitingForPartner") {
      if (timingQuality === "slightly") return COLOR.pressedSlightly;
      if (timingQuality === "clearly")  return COLOR.pressedClearly;
      return COLOR.pressedOnTime;
    }
  }

  // Hand-colour guide: highlight the next note to play while the hand is idle.
  if (stepIndex === lesson.currentStepIndex && status?.kind === "idle") {
    return hand === "left" ? COLOR.leftFuture : COLOR.rightFuture;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  snapshot: Snapshot | null;
  /** Full timing result; null when metronome is off. */
  timing: TimingResult | null;
}

// Colours for the floating badge (slightly = amber, clearly = orange-red).
const BADGE_COLOR: Record<Exclude<TimingQuality, "onTime">, string> = {
  slightly: "#d97706",
  clearly:  "#ef4444",
};

export function ScaleScoreView({ snapshot, timing }: Props) {
  const timingQuality = timing?.quality ?? null;
  const ef = useErrorFlash(snapshot);

  // Look up per-scale data (image path, MIDI notes, finger numbers).
  const descriptor = getScaleDescriptor(snapshot?.lesson.key ?? "cMajor");
  // Use per-scale positions when captured; fall back to formula.
  const rhX = descriptor.rhX ?? RH_X;
  const RH_POS: NotePos[] = descriptor.rhMidi.map((midi, i) => ({
    x: rhX[i],
    y: descriptor.rhY ? descriptor.rhY[i] : rhNoteY(midi),
  }));
  const LH_POS: NotePos[] = descriptor.lhMidi.map((midi, i) => ({
    x: rhX[i],
    y: descriptor.lhY ? descriptor.lhY[i] : lhNoteY(midi, i),
  }));
  const rhFingers = descriptor.rhFingers;
  const lhFingers = descriptor.lhFingers;

  // Direction-based score window.
  // The full position arrays have 29 entries (ascending 0..14 + descending 15..28).
  // For ascending-only we show positions 0..14; for descending-only positions 14..28
  // (apex is position 14, shared between both directions); for both we show 0..28.
  const direction = snapshot?.lesson.direction ?? "ascendingDescending";
  const scoreStart = direction === "descending" ? 14 : 0;
  const scoreEnd   = direction === "ascending"  ? 15 : 29;  // exclusive
  const rhPosSlice = RH_POS.slice(scoreStart, scoreEnd);
  const lhPosSlice = LH_POS.slice(scoreStart, scoreEnd);

  // Fading badge: fires on non-onTime results.
  const [badge, setBadge] = useState<{
    key: number; label: string; color: string; x: number; y: number;
  } | null>(null);
  const prevNoteMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timing || timing.quality === "onTime") return;
    if (timing.noteMs === prevNoteMsRef.current) return;
    prevNoteMsRef.current = timing.noteMs;

    const isEarly = timing.deviationMs < 0;
    const label   = isEarly ? "EARLY" : "LATE";
    const color   = BADGE_COLOR[timing.quality];

    // Use RH position for the badge anchor (it's always in the treble staff).
    // Offset by scoreStart to map lesson step index to the correct score position.
    const pos = RH_POS[scoreStart + timing.stepIndex];
    if (!pos) return;

    setBadge(prev => ({
      key:   (prev?.key ?? 0) + 1,
      label, color,
      x: pos.x + X_OFFSET,
      y: pos.y + Y_OFFSET - 28,
    }));
  }, [timing]);

  // ── Calibration state ──────────────────────────────────────────────────────
  const [cursor, setCursor]   = useState<{ x: number; y: number } | null>(null);
  const [offset, setOffset]   = useState({ x: X_OFFSET, y: Y_OFFSET });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // ── Capture state (two phases: RH then LH) ────────────────────────────────
  const [capturing, setCapturing]     = useState(false);
  const [capturePhase, setCapturePhase] = useState<'rh' | 'lh'>('rh');
  const [captureStep, setCaptureStep] = useState(0);
  const [capturedRhX, setCapturedRhX] = useState<number[]>([]);
  const [capturedRhY, setCapturedRhY] = useState<number[]>([]);
  const [capturedLhY, setCapturedLhY] = useState<number[]>([]);
  const pointerDownPos = useRef<{ cx: number; cy: number } | null>(null);

  const TOTAL_STEPS = RH_POS.length; // 29

  const svgCoords = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return {
        cx: (e.clientX - r.left) / r.width  * VB_W,
        cy: (e.clientY - r.top)  / r.height * VB_H,
      };
    }, []
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!CALIBRATE) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { cx, cy } = svgCoords(e);
    pointerDownPos.current = { cx, cy };
    if (!capturing) {
      dragRef.current = { px: cx, py: cy, ox: offset.x, oy: offset.y };
    }
  }, [capturing, offset, svgCoords]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!CALIBRATE) return;
    const { cx, cy } = svgCoords(e);
    setCursor({ x: Math.round(cx), y: Math.round(cy) });
    if (!capturing && dragRef.current) {
      setOffset({
        x: Math.round(dragRef.current.ox + cx - dragRef.current.px),
        y: Math.round(dragRef.current.oy + cy - dragRef.current.py),
      });
    }
  }, [capturing, svgCoords]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownPos.current;
    const { cx, cy } = svgCoords(e);
    dragRef.current = null;
    pointerDownPos.current = null;

    // In capture mode: treat a near-stationary release as a click.
    if (capturing && down && Math.abs(cx - down.cx) < 5 && Math.abs(cy - down.cy) < 5) {
      const rx = Math.round(cx), ry = Math.round(cy);
      if (capturePhase === 'rh') {
        setCapturedRhX(prev => [...prev, rx]);
        setCapturedRhY(prev => [...prev, ry]);
        if (captureStep + 1 >= TOTAL_STEPS) {
          // RH done — auto-advance to LH phase
          setCapturePhase('lh');
          setCaptureStep(0);
        } else {
          setCaptureStep(s => s + 1);
        }
      } else {
        setCapturedLhY(prev => [...prev, ry]);
        setCaptureStep(s => s + 1);
      }
    }
  }, [capturing, capturePhase, captureStep, TOTAL_STEPS, svgCoords]);

  const onPointerLeave = useCallback(() => {
    setCursor(null);
    dragRef.current = null;
  }, []);

  const startCapture = useCallback(() => {
    setCapturedRhX([]); setCapturedRhY([]); setCapturedLhY([]);
    setCapturePhase('rh');
    setCaptureStep(0);
    setCapturing(true);
  }, []);

  const undoCapture = useCallback(() => {
    if (capturePhase === 'rh') {
      if (capturedRhX.length === 0) return;
      setCapturedRhX(prev => prev.slice(0, -1));
      setCapturedRhY(prev => prev.slice(0, -1));
      setCaptureStep(s => Math.max(0, s - 1));
    } else {
      if (capturedLhY.length === 0) {
        // Undo back into RH phase
        setCapturePhase('rh');
        setCaptureStep(TOTAL_STEPS - 1);
        setCapturedRhX(prev => prev.slice(0, -1));
        setCapturedRhY(prev => prev.slice(0, -1));
      } else {
        setCapturedLhY(prev => prev.slice(0, -1));
        setCaptureStep(s => Math.max(0, s - 1));
      }
    }
  }, [capturePhase, capturedRhX, capturedLhY, TOTAL_STEPS]);

  const stopCapture = useCallback(() => {
    setCapturing(false);
  }, []);

  // Note name helper
  const midiName = (midi: number) => {
    const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  };

  // Build the finished output — three lines ready to paste into the descriptor in scales.ts
  const rhxOutput = (() => {
    if (capturedRhX.length < TOTAL_STEPS || capturedLhY.length < TOTAL_STEPS) return null;
    return [
      `// ${descriptor.label}`,
      `    rhX: [${capturedRhX.join(', ')}],`,
      `    rhY: [${capturedRhY.join(', ')}],`,
      `    lhY: [${capturedLhY.join(', ')}],`,
    ].join('\n');
  })();

  const isDragging = CALIBRATE && !capturing;

  const captureActive = CAPTURE_RH_X && capturing;
  const wantPointerEvents = CALIBRATE;

  return (
    <div style={{ position: "relative", width: "100%" }}>

      {/* ── Capture toolbar ─────────────────────────────────────────────── */}
      {CAPTURE_RH_X && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px", background: "#1e293b", flexWrap: "wrap",
        }}>
          {!capturing && capturedLhY.length < TOTAL_STEPS && (
            <button
              onClick={startCapture}
              style={{ padding: "4px 12px", background: "#2563eb", color: "white",
                       border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>
              {capturedRhX.length === 0 ? "▶ Start Capture (RH then LH)" : `▶ Resume`}
            </button>
          )}
          {capturing && (
            <>
              <span style={{ color: capturePhase === 'rh' ? "#fb923c" : "#60a5fa", fontWeight: 700, fontFamily: "monospace" }}>
                {capturePhase === 'rh' ? 'RH' : 'LH'} note {captureStep + 1}/{TOTAL_STEPS}:
                &nbsp;<span style={{ color: "white" }}>
                  {capturePhase === 'rh'
                    ? midiName(descriptor.rhMidi[captureStep] ?? 0)
                    : midiName(descriptor.lhMidi[captureStep] ?? 0)}
                  &nbsp;(finger {capturePhase === 'rh'
                    ? descriptor.rhFingers[captureStep]
                    : descriptor.lhFingers[captureStep]})
                </span>
              </span>
              <button onClick={undoCapture} disabled={capturedRhX.length === 0 && capturedLhY.length === 0}
                style={{ padding: "3px 10px", background: "#7c3aed", color: "white",
                         border: "none", borderRadius: 4, cursor: "pointer" }}>
                ↩ Undo
              </button>
              <button onClick={stopCapture}
                style={{ padding: "3px 10px", background: "#64748b", color: "white",
                         border: "none", borderRadius: 4, cursor: "pointer" }}>
                ✕ Cancel
              </button>
            </>
          )}
          {!capturing && capturedRhX.length > 0 && capturedLhY.length < TOTAL_STEPS && (
            <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>
              RH: {capturedRhX.length}/{TOTAL_STEPS} &nbsp; LH: {capturedLhY.length}/{TOTAL_STEPS}
            </span>
          )}
        </div>
      )}

      {/* ── Score image + SVG overlay ────────────────────────────────────── */}
      <div
        style={{ position: "relative", width: "100%", lineHeight: 0,
                 cursor: captureActive ? "crosshair" : isDragging ? "grab" : undefined }}
        onPointerDown={wantPointerEvents ? onPointerDown : undefined}
        onPointerMove={wantPointerEvents ? onPointerMove : undefined}
        onPointerUp={wantPointerEvents ? onPointerUp : undefined}
        onPointerLeave={wantPointerEvents ? onPointerLeave : undefined}
      >
      {/* Static score image — filled from the active scale descriptor. */}
      <img
        key={descriptor.imagePath}
        src={descriptor.imagePath}
        alt={`${descriptor.label} scale – grand staff`}
        style={{ width: "100%", height: "auto", display: "block" }}
        draggable={false}
      />

      {/*
        SVG overlay: same logical size as the image (VB_W × VB_H).
        preserveAspectRatio="none" stretches the viewBox to exactly cover
        the rendered image, so every (x, y) in this file maps to the
        matching pixel in the image regardless of display size.
      */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden
      >
        {/* Scale name label — top-left corner, matching original score typography.
             \u266D (flat) has a wider left bearing than \u266F (sharp) in most serif
             fonts, so we nudge it left with a negative dx tspan. */}
        <text
          x={20}
          y={42}
          fontSize={22}
          fontFamily="serif"
          fontStyle="italic"
          fontWeight="bold"
          fill="#111"
        >
          {descriptor.label.split("\u266D").reduce<React.ReactNode[]>((acc, part, i) =>
            i === 0 ? [part] : [...acc, <tspan key={i} dx={-4}>{"\u266D"}</tspan>, part]
          , [])}
        </text>

        {/* Right-hand highlight — only rendered when colour is non-null */}
        {rhPosSlice.map((p, lessonStep) => {
          const color = pickColor(lessonStep, "right", snapshot, ef, timingQuality);
          return color ? (
            <ellipse
              key={`rh-${lessonStep}`}
              cx={p.x + offset.x} cy={p.y + offset.y}
              rx={RX} ry={RY}
              fill={color} fillOpacity={0.75}
            />
          ) : null;
        })}

        {/* Left-hand highlight — only rendered when colour is non-null */}
        {lhPosSlice.map((p, lessonStep) => {
          const color = pickColor(lessonStep, "left", snapshot, ef, timingQuality);
          return color ? (
            <ellipse
              key={`lh-${lessonStep}`}
              cx={p.x + offset.x} cy={p.y + offset.y}
              rx={RX} ry={RY}
              fill={color} fillOpacity={0.75}
            />
          ) : null;
        })}

        {/* RH finger numbers — above each notehead, hidden in left-only mode */}
        {snapshot?.lesson.handsMode !== "leftOnly" && rhPosSlice.map((p, lessonStep) => (
          <text
            key={`rh-fn-${lessonStep}`}
            x={p.x + offset.x}
            y={p.y + offset.y - 14}
            textAnchor="middle"
            fontSize={11}
            fontWeight="800"
            fill="#c2410c"
            stroke="white"
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {rhFingers[scoreStart + lessonStep]}
          </text>
        ))}

        {/* LH finger numbers — below each notehead, hidden in right-only mode */}
        {snapshot?.lesson.handsMode !== "rightOnly" && lhPosSlice.map((p, lessonStep) => (
          <text
            key={`lh-fn-${lessonStep}`}
            x={p.x + offset.x}
            y={p.y + offset.y + 16}
            textAnchor="middle"
            fontSize={11}
            fontWeight="800"
            fill="#1d4ed8"
            stroke="white"
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {lhFingers[scoreStart + lessonStep]}
          </text>
        ))}

        {/* Fading EARLY / LATE badge */}
        {badge && (
          <text
            key={badge.key}
            x={badge.x}
            y={badge.y}
            textAnchor="middle"
            fill={badge.color}
            fontSize={13}
            fontWeight="800"
            letterSpacing="0.06em"
            className="timing-badge"
          >
            {badge.label}
          </text>
        )}

        {/* Calibration overlay: crosshair + cursor pos + running offset */}
        {CALIBRATE && cursor && (
          <g>
            <line x1={cursor.x} y1={0} x2={cursor.x} y2={VB_H}
              stroke={captureActive ? "#fbbf24" : "red"} strokeWidth={1} strokeDasharray="4 3" />
            <line x1={0} y1={cursor.y} x2={VB_W} y2={cursor.y}
              stroke={captureActive ? "#fbbf24" : "red"} strokeWidth={1} strokeDasharray="4 3" />
            <rect x={4} y={4} width={280} height={44} rx={4}
              fill="black" fillOpacity={0.75} />
            <text x={12} y={20} fill="#aaa" fontSize={12} fontFamily="monospace">
              cursor: {cursor.x}, {cursor.y}
            </text>
            {captureActive ? (
              <text x={12} y={38} fill="#fbbf24" fontSize={13} fontFamily="monospace" fontWeight="bold">
                click note {captureStep + 1}/{TOTAL_STEPS} → x={cursor.x}
              </text>
            ) : (
              <text x={12} y={38} fill="white" fontSize={14} fontFamily="monospace" fontWeight="bold">
                X_OFFSET={offset.x}  Y_OFFSET={offset.y}
              </text>
            )}
          </g>
        )}

        {/* Capture: already-captured RH positions — orange ticks */}
        {captureActive && capturedRhX.map((x, i) => (
          <line key={`rh-cap-${i}`}
            x1={x} y1={0} x2={x} y2={VB_H}
            stroke="#fb923c" strokeWidth={1} strokeOpacity={0.4} />
        ))}

        {/* Capture: dashed ellipse at the current expected notehead centre */}
        {captureActive && captureStep < TOTAL_STEPS && (() => {
          const p = capturePhase === 'rh' ? RH_POS[captureStep] : LH_POS[captureStep];
          const stroke = capturePhase === 'rh' ? '#fb923c' : '#60a5fa';
          return (
            <ellipse
              cx={p.x + offset.x} cy={p.y + offset.y}
              rx={RX + 6} ry={RY + 6}
              fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="6 4"
            />
          );
        })()}
      </svg>
      </div>{/* end score+svg wrapper */}

      {/* ── RH_X result panel ───────────────────────────────────────────── */}
      {CAPTURE_RH_X && rhxOutput && (
        <div style={{
          background: "#0f172a", padding: "12px 14px", borderTop: "2px solid #22c55e",
        }}>
          <div style={{ color: "#4ade80", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
            ✓ {descriptor.label} — copy ALL THREE lines and send to agent:
          </div>
          <pre style={{
            color: "#f1f5f9", fontFamily: "monospace", fontSize: 12,
            whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
            userSelect: "all",
          }}>{rhxOutput}</pre>
        </div>
      )}
    </div>
  );
}
