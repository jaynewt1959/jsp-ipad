/**
 * Composite practice score (0–100) combining:
 *
 *   Precision  40%  — note accuracy: totalSteps / (totalSteps + mistakes + skips)
 *   Evenness   25%  — volume consistency: 100 − min(velocityCV, 100)
 *   Rhythm     35%  — timing consistency: 100 − min(rhythmCV, 100)
 *
 * When evenness or rhythm data is unavailable (too few notes),
 * weights are redistributed proportionally among available metrics.
 */
export function compositeScore(
  totalSteps: number,
  mistakes: number,
  skips: number,
  velocityCV: number | null,
  rhythmCV: number | null,
): number | null {
  if (totalSteps === 0) return null;

  const precision = (totalSteps / (totalSteps + mistakes + skips)) * 100;
  const evenness =
    velocityCV != null ? 100 - Math.min(velocityCV, 100) : null;
  const rhythm = rhythmCV != null ? 100 - Math.min(rhythmCV, 100) : null;

  let weightedSum = precision * 40;
  let totalWeight = 40;

  if (evenness != null) {
    weightedSum += evenness * 25;
    totalWeight += 25;
  }

  if (rhythm != null) {
    weightedSum += rhythm * 35;
    totalWeight += 35;
  }

  return weightedSum / totalWeight;
}
