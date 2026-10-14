/** z for a 95% confidence level. */
const Z_95 = 1.96;

export interface ProportionInterval {
  /** Point estimate k / n. */
  readonly p: number;
  /** Lower bound of the Wilson interval, in [0, 1]. */
  readonly low: number;
  /** Upper bound of the Wilson interval, in [0, 1]. */
  readonly high: number;
  readonly n: number;
}

/**
 * Wilson score interval for a share of successes (spec A-06, 95%).
 * `successes` may be fractional (a "partial" attempt counts as 0.5).
 *
 * Returns null when n is 0 (no data).
 *
 * @throws RangeError if the arguments are not finite or `successes` is outside [0, n].
 */
export function wilsonInterval(successes: number, n: number): ProportionInterval | null {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n < 0 || successes < 0) {
    throw new RangeError('successes and n must be finite numbers >= 0');
  }
  if (successes > n) {
    throw new RangeError('successes must not exceed n');
  }
  if (n === 0) {
    return null;
  }
  const p = successes / n;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half), n };
}

/** How a "partial" attempt is counted when computing a share of successes. */
export type PartialPolicy = 'half' | 'success' | 'failure';

export type AttemptResult = 'successful' | 'partial' | 'unsuccessful';

/**
 * Number of successes in a list of attempt results; a partial attempt counts as 0.5 by default
 * (spec A-06), or fully / not at all according to `partial`.
 */
export function countSuccesses(
  results: readonly AttemptResult[],
  partial: PartialPolicy = 'half',
): number {
  const partialWeight = partial === 'half' ? 0.5 : partial === 'success' ? 1 : 0;
  let total = 0;
  for (const r of results) {
    if (r === 'successful') {
      total += 1;
    } else if (r === 'partial') {
      total += partialWeight;
    }
  }
  return total;
}
