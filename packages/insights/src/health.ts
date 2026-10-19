import { median } from '@pawquest/core';

import { dailyLoads, isHighLoad, loadPercentile, type DayLoad, type LoadEvent } from './load';

/**
 * Descriptions for the "Health and activity" section (docs/23, step 3.16): a weight over time, the
 * walks that were unusual for this dog (A-18) and the busiest days (A-08). Everything is a
 * statement of what was recorded; nothing is a diagnosis, and the only advice is the neutral
 * "if the change stays, it is worth mentioning to the vet".
 */

const DAY = 86_400_000;

export interface WeightPoint {
  readonly at: number;
  readonly grams: number;
}

export interface WeightChange {
  readonly latest: WeightPoint;
  /** Grams now minus grams at the entry nearest to 30 days before the latest one, or null. */
  readonly change30: number | null;
  readonly change90: number | null;
}

/**
 * The latest weight and how it differs from about 30 and 90 days earlier: the entry nearest to
 * that moment, if one lies within a third of the period of it (an entry from last week is not "a
 * month ago"). Null without any weight.
 */
export function weightChange(points: readonly WeightPoint[]): WeightChange | null {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const latest = sorted[sorted.length - 1];
  if (latest === undefined) {
    return null;
  }
  const earlier = sorted.slice(0, -1);
  const since = (days: number): number | null => {
    const target = latest.at - days * DAY;
    let best: WeightPoint | undefined;
    for (const p of earlier) {
      const away = Math.abs(p.at - target);
      if (away <= (days / 3) * DAY && (best === undefined || away < Math.abs(best.at - target))) {
        best = p;
      }
    }
    return best === undefined ? null : latest.grams - best.grams;
  };
  return { latest, change30: since(30), change90: since(90) };
}

export interface MeasuredWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly durationS: number;
}

export type UnusualKind = 'short' | 'long';

export interface UnusualWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly durationS: number;
  readonly kind: UnusualKind;
  /** The usual (median) length of the other walks of the window, seconds. */
  readonly usualS: number;
}

/** The window of walks an unusual one is measured against, and how many are needed (A-18). */
export const UNUSUAL_WINDOW = 30;
export const MIN_UNUSUAL_WALKS = 10;
const UNUSUAL_Z = 3.5;

/**
 * Walks whose length stands out from the usual of the same dog (A-18): the robust z-score
 * 0.6745 * (x - median) / MAD is above 3.5 in size, against the other walks of the last 30 (at
 * least 10 of them). Only the most recent 30 walks are looked at, oldest first in the answer.
 */
export function unusualWalks(walks: readonly MeasuredWalk[]): UnusualWalk[] {
  const recent = [...walks].sort((a, b) => a.startedAt - b.startedAt).slice(-UNUSUAL_WINDOW);
  const found: UnusualWalk[] = [];
  for (const walk of recent) {
    const others = recent.filter((w) => w.id !== walk.id).map((w) => w.durationS);
    if (others.length + 1 < MIN_UNUSUAL_WALKS) {
      continue;
    }
    const med = median(others);
    const mad = median(others.map((x) => Math.abs(x - med)));
    if (mad === 0) {
      continue;
    }
    const z = (0.6745 * (walk.durationS - med)) / mad;
    if (Math.abs(z) > UNUSUAL_Z) {
      found.push({
        id: walk.id,
        startedAt: walk.startedAt,
        durationS: walk.durationS,
        kind: z < 0 ? 'short' : 'long',
        usualS: med,
      });
    }
  }
  return found;
}

/** The same direction on at least this many walks over at least this many days. */
export const PERSISTENT_WALKS = 3;
export const PERSISTENT_DAYS = 14;

/**
 * The change stays (A-18): the recent unusual walks go the same way, at least three of them
 * spread over two weeks or more. Then, and only then, the neutral note about the vet is shown.
 */
export function persistentChange(unusual: readonly UnusualWalk[]): UnusualKind | null {
  for (const kind of ['short', 'long'] as const) {
    const same = unusual.filter((u) => u.kind === kind).sort((a, b) => a.startedAt - b.startedAt);
    const first = same[0];
    const last = same[same.length - 1];
    if (
      first !== undefined &&
      last !== undefined &&
      same.length >= PERSISTENT_WALKS &&
      last.startedAt - first.startedAt >= PERSISTENT_DAYS * DAY
    ) {
      return kind;
    }
  }
  return null;
}

export interface BusyDay {
  readonly day: number;
  readonly load: number;
  readonly percentile: number;
}

/**
 * The days of the last 90 with the most triggers and the strongest reactions (A-08), highest
 * first; only days above the 85th percentile of the days of this dog and only when at least 14
 * days are tracked (fewer: none).
 */
export function busyDays(
  events: readonly LoadEvent[],
  trackedDays: readonly number[],
  today: number,
  limit = 3,
): BusyDay[] {
  const loads: DayLoad[] = dailyLoads(events, { trackedDays });
  return loads
    .flatMap((d) => {
      const { percentile } = loadPercentile(today, d.load, loads);
      return d.load > 0 && percentile !== null && isHighLoad(percentile)
        ? [{ day: d.day, load: d.load, percentile }]
        : [];
    })
    .filter((d) => d.day <= today && d.day > today - 90)
    .sort((a, b) => b.load - a.load || b.day - a.day)
    .slice(0, limit);
}
