import { median } from '@pawquest/core';

import { mondayOf } from './calendar';
import { wilsonInterval, type ProportionInterval } from './proportion';
import { localDay } from './time';

/**
 * The data of the charts (docs/23, step 3.9): bars with intervals, never smoothed curves, and a
 * group with too few walks is still listed but marked, so an empty bar is not read as "zero".
 */

export interface ChartWalk {
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  /** The ground at the start (dry, damp, wet, snow, icy), when the weather is known. */
  readonly ground: string | undefined;
}

export interface WeekBar {
  readonly mondayDay: number;
  readonly walks: number;
  readonly durationS: number;
  /** Time walked on wet, snowy or icy ground (the rest is dry or damp or unknown). */
  readonly wetDurationS: number;
}

const WET = new Set(['wet', 'snow', 'icy']);

/** Time walked per week for the last `weeks` weeks, the week of `today` last. */
export function weeklyBars(walks: readonly ChartWalk[], today: number, weeks: number): WeekBar[] {
  const lastMonday = mondayOf(today);
  const firstMonday = lastMonday - (weeks - 1) * 7;
  const bars = Array.from({ length: weeks }, (_, i) => ({
    mondayDay: firstMonday + i * 7,
    walks: 0,
    durationS: 0,
    wetDurationS: 0,
  }));
  for (const walk of walks) {
    const day = localDay(walk.startedAt, walk.tzOffsetMin);
    const bar = day > today ? undefined : bars[Math.floor((mondayOf(day) - firstMonday) / 7)];
    if (bar === undefined || mondayOf(day) < firstMonday) {
      continue;
    }
    bar.walks += 1;
    bar.durationS += walk.durationS ?? 0;
    if (walk.ground !== undefined && WET.has(walk.ground)) {
      bar.wetDurationS += walk.durationS ?? 0;
    }
  }
  return bars;
}

export interface ShareBar {
  readonly value: string;
  readonly k: number;
  readonly n: number;
  readonly interval: ProportionInterval | null;
  /** The group has enough walks for the bar to be read as a finding. */
  readonly enough: boolean;
}

export interface ChartUnit {
  readonly dims: Readonly<Record<string, string | undefined>>;
  readonly outcomes: Readonly<Record<string, boolean | undefined>>;
}

/**
 * The share of walks with an outcome in each level of a dimension, in the order given; levels
 * that never occur are left out. A level is "enough" from `minN` walks with a known outcome.
 */
export function groupShares(
  units: readonly ChartUnit[],
  dimension: string,
  outcome: string,
  order: readonly string[],
  minN = 5,
): ShareBar[] {
  return order.flatMap((value) => {
    const group = units.filter(
      (u) => u.dims[dimension] === value && u.outcomes[outcome] !== undefined,
    );
    if (group.length === 0) {
      return [];
    }
    const k = group.filter((u) => u.outcomes[outcome] === true).length;
    return [
      {
        value,
        k,
        n: group.length,
        interval: wilsonInterval(k, group.length),
        enough: group.length >= minN,
      },
    ];
  });
}

export interface SpreadBar {
  readonly value: string;
  readonly n: number;
  readonly median: number;
  /** The middle half of the values: where most of them lie. */
  readonly q1: number;
  readonly q3: number;
  readonly enough: boolean;
}

function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const low = sorted[below] ?? 0;
  const high = sorted[Math.ceil(position)] ?? low;
  return low + (high - low) * (position - below);
}

/** The typical value in each level of a dimension: median and the middle half. */
export function groupSpreads(
  items: readonly { readonly level: string | undefined; readonly x: number | null }[],
  order: readonly string[],
  minN = 3,
): SpreadBar[] {
  return order.flatMap((value) => {
    const values = items
      .flatMap((i) => (i.level === value && i.x !== null && Number.isFinite(i.x) ? [i.x] : []))
      .sort((a, b) => a - b);
    if (values.length === 0) {
      return [];
    }
    return [
      {
        value,
        n: values.length,
        median: median(values),
        q1: quantile(values, 0.25),
        q3: quantile(values, 0.75),
        enough: values.length >= minN,
      },
    ];
  });
}
