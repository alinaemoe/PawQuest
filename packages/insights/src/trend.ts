import { median } from '@pawquest/core';

/** One observation of a series: `t` is the position in time (e.g. week number), `x` the value. */
export interface SeriesPoint {
  readonly t: number;
  readonly x: number;
}

/** A trend is not computed from fewer points than this (spec A-09). */
export const MIN_TREND_POINTS = 6;

export type TrendLabel = 'insufficient' | 'none' | 'possible' | 'clear';
export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendResult {
  readonly n: number;
  readonly label: TrendLabel;
  /** Direction of the Theil-Sen slope; null when the series is too short. */
  readonly direction: TrendDirection | null;
  /** Theil-Sen slope in x units per t unit; null when the series is too short. */
  readonly slope: number | null;
  /** Mann-Kendall Z statistic; null when the series is too short. */
  readonly z: number | null;
}

function assertSeries(series: readonly SeriesPoint[]): SeriesPoint[] {
  for (const point of series) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.x)) {
      throw new RangeError('every point must have a finite t and x');
    }
  }
  // Stable sort: points with the same t keep their input order.
  return [...series].sort((a, b) => a.t - b.t);
}

/**
 * Theil-Sen slope: the median of all pairwise slopes (x_j - x_i) / (t_j - t_i). Pairs with the
 * same t are skipped. Robust against outliers. Returns null when no pair has distinct times.
 *
 * @throws RangeError for non-finite values.
 */
export function theilSenSlope(series: readonly SeriesPoint[]): number | null {
  const sorted = assertSeries(series);
  const slopes: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a !== undefined && b !== undefined && b.t !== a.t) {
        slopes.push((b.x - a.x) / (b.t - a.t));
      }
    }
  }
  return slopes.length === 0 ? null : median(slopes);
}

/**
 * Mann-Kendall Z with the tie correction: S = sum of sign(x_j - x_i) over i < j, variance
 * [n(n-1)(2n+5) - sum over tie groups of t(t-1)(2t+5)] / 18, Z = (S - sign(S)) / sqrt(Var).
 * Z is 0 when S is 0 or the variance is 0 (all values equal).
 *
 * @throws RangeError for non-finite values.
 */
export function mannKendallZ(series: readonly SeriesPoint[]): number {
  const sorted = assertSeries(series);
  const n = sorted.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a !== undefined && b !== undefined) {
        s += Math.sign(b.x - a.x);
      }
    }
  }

  const tieCounts = new Map<number, number>();
  for (const point of sorted) {
    tieCounts.set(point.x, (tieCounts.get(point.x) ?? 0) + 1);
  }
  let tieTerm = 0;
  for (const t of tieCounts.values()) {
    tieTerm += t * (t - 1) * (2 * t + 5);
  }
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  if (s === 0 || variance <= 0) {
    return 0;
  }
  return (s - Math.sign(s)) / Math.sqrt(variance);
}

/** Maps |Z| to the label shown to the user (spec A-09). */
export function trendLabel(z: number): Exclude<TrendLabel, 'insufficient'> {
  const magnitude = Math.abs(z);
  if (magnitude >= 1.96) {
    return 'clear';
  }
  return magnitude >= 1.28 ? 'possible' : 'none';
}

/**
 * Trend of a series (spec A-09, decision D-49). Needs at least 6 points, otherwise the label is
 * `insufficient`. For recovery times pass the logarithm of the values.
 *
 * @throws RangeError for non-finite values.
 */
export function analyzeTrend(series: readonly SeriesPoint[]): TrendResult {
  assertSeries(series);
  const n = series.length;
  if (n < MIN_TREND_POINTS) {
    return { n, label: 'insufficient', direction: null, slope: null, z: null };
  }
  const slope = theilSenSlope(series);
  const z = mannKendallZ(series);
  let direction: TrendDirection = 'flat';
  if (slope !== null && slope > 0) {
    direction = 'up';
  } else if (slope !== null && slope < 0) {
    direction = 'down';
  }
  return { n, label: trendLabel(z), direction, slope, z };
}
