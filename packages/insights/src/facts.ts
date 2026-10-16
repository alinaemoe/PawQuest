import { localDay, weekOfLocalDay } from './time';

/**
 * Facts and records about the walks of a dog (docs/23, step 3.4): what is plainly counted, with
 * nothing inferred. Every fact carries the walks it comes from, ties are all named (never one
 * picked out of two equal ones), and a fact needs enough walks to be worth saying.
 */

export interface FactWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly placeId: string | null;
  /** Morning, day, evening or night (local time). */
  readonly timeOfDay: string;
  /** The longest time on the walk without a hard moment, in ms; null when it was not worth telling. */
  readonly calmMs: number | null;
}

/** Favourites need this many walks, records this many. */
export const MIN_WALKS_FOR_FAVOURITES = 5;
export const MIN_WALKS_FOR_RECORDS = 3;

export interface Favourite<T> {
  /** The leaders: more than one when they are tied. */
  readonly values: readonly T[];
  /** Walks of each leader. */
  readonly count: number;
  /** Walks that were counted (those with a known value). */
  readonly of: number;
}

export interface Record1 {
  /** The walks that hold the record: more than one when tied. */
  readonly walkIds: readonly string[];
  readonly value: number;
}

export interface BusiestWeek {
  /** The Monday of that week as a local day number (days since 1970-01-01). */
  readonly weekStartDay: number;
  readonly walks: number;
  /** All weeks tied for the most. */
  readonly tied: number;
}

export interface DayStreak {
  /** The longest run of days that each had a walk. */
  readonly best: number;
  /** The run that ends today or yesterday (0 when the last walk was earlier). */
  readonly current: number;
}

export interface Facts {
  readonly totals: {
    readonly walks: number;
    readonly durationS: number;
    readonly distanceM: number;
    readonly firstAt: number | null;
    readonly lastAt: number | null;
  };
  readonly favouritePlaces: Favourite<string> | null;
  readonly favouriteTimeOfDay: Favourite<string> | null;
  /** 0 = Monday ... 6 = Sunday. */
  readonly favouriteWeekdays: Favourite<number> | null;
  readonly longestWalk: Record1 | null;
  readonly farthestWalk: Record1 | null;
  readonly longestCalm: Record1 | null;
  readonly busiestWeek: BusiestWeek | null;
  readonly streak: DayStreak | null;
}

function leaders<T>(values: readonly T[]): Favourite<T> | null {
  if (values.length === 0) {
    return null;
  }
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  return {
    values: [...counts.entries()].filter(([, n]) => n === top).map(([v]) => v),
    count: top,
    of: values.length,
  };
}

function record(walks: readonly FactWalk[], pick: (w: FactWalk) => number | null): Record1 | null {
  let best = -Infinity;
  let ids: string[] = [];
  for (const walk of walks) {
    const value = pick(walk);
    if (value === null || !(value > 0)) {
      continue;
    }
    if (value > best) {
      best = value;
      ids = [walk.id];
    } else if (value === best) {
      ids.push(walk.id);
    }
  }
  return ids.length === 0 ? null : { walkIds: ids, value: best };
}

/** 0 = Monday: the local weekday of a moment. */
export function weekdayOf(ts: number, tzOffsetMin: number): number {
  return (((localDay(ts, tzOffsetMin) + 3) % 7) + 7) % 7;
}

function dayRuns(days: readonly number[], today: number): DayStreak | null {
  if (days.length === 0) {
    return null;
  }
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted[sorted.length - 1] ?? 0;
  // the run that ends on the last walk day counts as current only while it is today or yesterday
  return { best, current: last >= today - 1 ? run : 0 };
}

/**
 * The facts of a set of walks. `now` and `tzOffsetMin` give "today" for the current run of days.
 * Anything that does not have enough walks behind it is `null`.
 */
export function computeFacts(walks: readonly FactWalk[], now: number, tzOffsetMin: number): Facts {
  const n = walks.length;
  const starts = walks.map((w) => w.startedAt);
  const totals = {
    walks: n,
    durationS: walks.reduce((sum, w) => sum + (w.durationS ?? 0), 0),
    distanceM: walks.reduce((sum, w) => sum + (w.distanceM ?? 0), 0),
    firstAt: n === 0 ? null : Math.min(...starts),
    lastAt: n === 0 ? null : Math.max(...starts),
  };
  const favourites = n >= MIN_WALKS_FOR_FAVOURITES;
  const records = n >= MIN_WALKS_FOR_RECORDS;

  const weeks = new Map<number, number>();
  for (const w of walks) {
    const week = weekOfLocalDay(localDay(w.startedAt, w.tzOffsetMin));
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  const mostInWeek = weeks.size === 0 ? 0 : Math.max(...weeks.values());
  const topWeeks = [...weeks.entries()]
    .filter(([, count]) => count === mostInWeek)
    .map(([week]) => week);
  // the newest of the tied weeks is the one named, the number of ties is told
  const topWeek = topWeeks.length === 0 ? null : Math.max(...topWeeks);

  return {
    totals,
    favouritePlaces: favourites
      ? leaders(walks.flatMap((w) => (w.placeId === null ? [] : [w.placeId])))
      : null,
    favouriteTimeOfDay: favourites ? leaders(walks.map((w) => w.timeOfDay)) : null,
    favouriteWeekdays: favourites
      ? leaders(walks.map((w) => weekdayOf(w.startedAt, w.tzOffsetMin)))
      : null,
    longestWalk: records ? record(walks, (w) => w.durationS) : null,
    farthestWalk: records ? record(walks, (w) => w.distanceM) : null,
    longestCalm: records ? record(walks, (w) => w.calmMs) : null,
    busiestWeek:
      records && topWeek !== null && weeks.size >= 2
        ? { weekStartDay: topWeek * 7 - 3, walks: mostInWeek, tied: topWeeks.length }
        : null,
    streak: records
      ? dayRuns(
          walks.map((w) => localDay(w.startedAt, w.tzOffsetMin)),
          localDay(now, tzOffsetMin),
        )
      : null,
  };
}
