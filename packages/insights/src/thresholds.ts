import { median } from '@pawquest/core';

import { mondayOf } from './calendar';
import { localDay } from './time';
import { analyzeTrend, type TrendResult } from './trend';

/**
 * How close a trigger can come before the dog reacts (A-15) and how long it takes her to calm
 * down after a hard moment (A-16): weekly medians, a trend only when it is steady enough, and
 * no promise of progress; a number going down is a number going down (docs/23, step 3.10).
 */

/** A week with fewer events than this is left out of the series (A-15, A-16). */
export const MIN_WEEK_EVENTS = 3;

/** The distance of an event given as a chip, in metres (A-15). */
export const BUCKET_METERS: Readonly<Record<string, number>> = { far: 20, mid: 10, near: 3 };

export interface ReactionEvent {
  readonly ts: number;
  readonly tzOffsetMin: number;
  /** 1-5, or null when it was not given. */
  readonly reaction: number | null;
  readonly distanceM: number | null;
  readonly bucket: string | null;
}

export interface RecoveryEvent {
  readonly ts: number;
  readonly tzOffsetMin: number;
  readonly recoveryS: number | null;
}

export interface WeekPoint {
  readonly mondayDay: number;
  readonly n: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
}

export interface WeeklySeries {
  /** Weeks with enough events, oldest first. */
  readonly weeks: readonly WeekPoint[];
  /** Events the series is made of, and how many of them fell into weeks that were left out. */
  readonly n: number;
  readonly leftOut: number;
  /** The first and the last weekly median (a series of two weeks or more). */
  readonly first: number | null;
  readonly last: number | null;
  readonly trend: TrendResult;
}

function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const low = sorted[below] ?? 0;
  const high = sorted[Math.ceil(position)] ?? low;
  return low + (high - low) * (position - below);
}

function weekly(
  items: readonly { readonly ts: number; readonly tzOffsetMin: number; readonly x: number }[],
  logScale: boolean,
): WeeklySeries {
  const byWeek = new Map<number, number[]>();
  for (const item of items) {
    const monday = mondayOf(localDay(item.ts, item.tzOffsetMin));
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), item.x]);
  }
  const weeks = [...byWeek.entries()]
    .filter(([, values]) => values.length >= MIN_WEEK_EVENTS)
    .sort((a, b) => a[0] - b[0])
    .map(([mondayDay, values]): WeekPoint => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        mondayDay,
        n: values.length,
        median: median(sorted),
        q1: quantile(sorted, 0.25),
        q3: quantile(sorted, 0.75),
      };
    });
  const used = weeks.reduce((sum, w) => sum + w.n, 0);
  return {
    weeks,
    n: used,
    leftOut: items.length - used,
    first: weeks.length >= 2 ? (weeks[0]?.median ?? null) : null,
    last: weeks.length >= 2 ? (weeks[weeks.length - 1]?.median ?? null) : null,
    trend: analyzeTrend(
      weeks.map((w, i) => ({ t: i, x: logScale ? Math.log(Math.max(w.median, 1)) : w.median })),
    ),
  };
}

/**
 * The distance at which events with a reaction of 2 or more happened, by week (A-15): the exact
 * distance when it was given, otherwise the middle of the chip. Events without any distance are
 * not part of the series.
 */
export function reactionDistanceSeries(events: readonly ReactionEvent[]): WeeklySeries {
  const items = events.flatMap((e) => {
    if (e.reaction === null || e.reaction < 2) {
      return [];
    }
    const x = e.distanceM ?? (e.bucket === null ? undefined : BUCKET_METERS[e.bucket]);
    return x === undefined ? [] : [{ ts: e.ts, tzOffsetMin: e.tzOffsetMin, x }];
  });
  return weekly(items, false);
}

export interface RecoverySeries extends WeeklySeries {
  /** Events in all (with or without a recovery time) and the share without one, 0..1. */
  readonly events: number;
  readonly missingShare: number | null;
}

/** The time to calm down after a hard moment, by week (A-16); the trend is taken on the logarithm. */
export function recoverySeries(events: readonly RecoveryEvent[]): RecoverySeries {
  const items = events.flatMap((e) =>
    e.recoveryS === null ? [] : [{ ts: e.ts, tzOffsetMin: e.tzOffsetMin, x: e.recoveryS }],
  );
  return {
    ...weekly(items, true),
    events: events.length,
    missingShare: events.length === 0 ? null : (events.length - items.length) / events.length,
  };
}
