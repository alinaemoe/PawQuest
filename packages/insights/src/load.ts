import { localDay } from './time';
import { assertFinite } from './time';
import type { Moment } from './skills';

/** A recorded event with the data needed for the day load. */
export interface LoadEvent extends Moment {
  /** `trigger` events count; everything else is ignored. */
  readonly kind: string;
  /** Event type key, used to look up its weight. */
  readonly typeId: string;
  /** Reaction level 1..5 when recorded. */
  readonly reaction?: number | undefined;
}

export interface DayLoad {
  /** Local day number (days since 1970-01-01). */
  readonly day: number;
  readonly load: number;
}

/** Share of the personal day-load distribution above which a day counts as high (A-08, Quests). */
export const HIGH_LOAD_PERCENTILE = 85;
/** Days of history used for the percentile. */
export const LOAD_WINDOW_DAYS = 90;
/** Minimum number of tracked days in the window for the percentile to be shown. */
export const MIN_LOAD_DAYS = 14;

/**
 * Multiplier of a reaction: 1 + (reaction - 1) / 4, so reaction 1 gives 1 and reaction 5 gives 2.
 * No reaction recorded gives 1.
 *
 * @throws RangeError if a given reaction is not a number in [1, 5].
 */
export function reactionMultiplier(reaction: number | undefined): number {
  if (reaction === undefined) {
    return 1;
  }
  if (!Number.isFinite(reaction) || reaction < 1 || reaction > 5) {
    throw new RangeError('reaction must be a number between 1 and 5');
  }
  return 1 + (reaction - 1) / 4;
}

export interface DailyLoadOptions {
  /** Weight per event type key. Unlisted types use `defaultWeight`. */
  readonly weights?: Readonly<Record<string, number>>;
  readonly defaultWeight?: number;
  /** Local days on which the owner recorded anything; they appear with load 0 if no trigger. */
  readonly trackedDays?: readonly number[];
}

/**
 * Load of each local day (spec A-08, decision D-50): the sum over trigger events of
 * weight(type) * reactionMultiplier. Sorted by day ascending.
 *
 * @throws RangeError for non-finite times, invalid reactions or negative weights.
 */
export function dailyLoads(
  events: readonly LoadEvent[],
  options: DailyLoadOptions = {},
): DayLoad[] {
  const defaultWeight = options.defaultWeight ?? 1;
  if (!Number.isFinite(defaultWeight) || defaultWeight < 0) {
    throw new RangeError('defaultWeight must be a finite number >= 0');
  }
  const loads = new Map<number, number>();
  for (const day of options.trackedDays ?? []) {
    assertFinite('trackedDays', day);
    loads.set(day, 0);
  }
  for (const e of events) {
    assertFinite('event', e.ts, e.tzOffsetMin);
    const multiplier = reactionMultiplier(e.reaction);
    if (e.kind !== 'trigger') {
      continue;
    }
    const weight = options.weights?.[e.typeId] ?? defaultWeight;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('weights must be finite numbers >= 0');
    }
    const day = localDay(e.ts, e.tzOffsetMin);
    loads.set(day, (loads.get(day) ?? 0) + weight * multiplier);
  }
  return [...loads.entries()]
    .map(([day, load]): DayLoad => ({ day, load }))
    .sort((a, b) => a.day - b.day);
}

export interface LoadPercentile {
  /** Percentile 0..100 by mid-rank, or null when there are too few tracked days. */
  readonly percentile: number | null;
  /** Tracked days of the window that were used. */
  readonly daysUsed: number;
}

/**
 * Where a day's load stands among the owner's own days of the last 90 (spec A-08, D-50):
 * (days with less load + half of the days with equal load) / days, in percent. Only days in the
 * window (today - 90, today] count; fewer than 14 of them gives no percentile.
 *
 * @throws RangeError for non-finite arguments.
 */
export function loadPercentile(
  today: number,
  value: number,
  days: readonly DayLoad[],
  windowDays: number = LOAD_WINDOW_DAYS,
  minDays: number = MIN_LOAD_DAYS,
): LoadPercentile {
  assertFinite('arguments', today, value, windowDays, minDays);
  const inWindow = days.filter((d) => d.day > today - windowDays && d.day <= today);
  if (inWindow.length < minDays || inWindow.length === 0) {
    return { percentile: null, daysUsed: inWindow.length };
  }
  const less = inWindow.filter((d) => d.load < value).length;
  const equal = inWindow.filter((d) => d.load === value).length;
  return { percentile: ((less + 0.5 * equal) / inWindow.length) * 100, daysUsed: inWindow.length };
}

/** A day is high-load when its percentile is strictly above 85 (null: unknown, so no). */
export function isHighLoad(percentile: number | null): boolean {
  return percentile !== null && percentile > HIGH_LOAD_PERCENTILE;
}
