import { median } from '@pawquest/core';

import { localDay, weekOfLocalDay } from './time';
import type { SeriesPoint } from './trend';

/** One dated observation. `tzOffsetMin` is the UTC offset in minutes at the moment of recording. */
export interface DatedValue {
  readonly ts: number;
  readonly tzOffsetMin: number;
  readonly value: number;
}

/** A week needs this many observations to produce a point (spec A-09). */
export const MIN_PER_WEEK = 3;

/**
 * Local week number counted from the week containing 1970-01-01, with weeks starting on Monday.
 * 1970-01-01 was a Thursday, hence the +3 (decision D-49).
 */
export function weekIndex(ts: number, tzOffsetMin: number): number {
  return weekOfLocalDay(localDay(ts, tzOffsetMin));
}

/**
 * Weekly medians for trend analysis (spec A-09): groups observations into local Monday-based weeks
 * and keeps a week only if it has at least `minPerWeek` observations. The result is sorted by week.
 *
 * @throws RangeError for non-finite timestamps, offsets or values.
 */
export function weeklySeries(
  observations: readonly DatedValue[],
  minPerWeek: number = MIN_PER_WEEK,
): SeriesPoint[] {
  const weeks = new Map<number, number[]>();
  for (const o of observations) {
    if (!Number.isFinite(o.ts) || !Number.isFinite(o.tzOffsetMin) || !Number.isFinite(o.value)) {
      throw new RangeError('ts, tzOffsetMin and value must be finite numbers');
    }
    const week = weekIndex(o.ts, o.tzOffsetMin);
    const values = weeks.get(week);
    if (values === undefined) {
      weeks.set(week, [o.value]);
    } else {
      values.push(o.value);
    }
  }
  return [...weeks.entries()]
    .filter(([, values]) => values.length >= minPerWeek)
    .map(([week, values]): SeriesPoint => ({ t: week, x: median(values) }))
    .sort((a, b) => a.t - b.t);
}
