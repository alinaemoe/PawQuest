import type { Moment } from './skills';
import { assertFinite, localDay, weekOfLocalDay } from './time';

/** Missed days per calendar week that the streak forgives (spec A-21, "paw pause"). */
export const PAUSES_PER_WEEK = 2;

export interface StreakResult {
  /** Days with a record (or a rest day) in the current chain; bridged days are not counted. */
  readonly current: number;
  /** The longest chain that ended on any day with a record. */
  readonly best: number;
  /** False when the streak is broken (current is 0). */
  readonly alive: boolean;
  /** Missed days of the current chain closed by a paw pause, ascending. */
  readonly bridgedDays: readonly number[];
}

export interface StreakOptions {
  readonly pausesPerWeek?: number;
}

/**
 * Local days that count as "a day with a record" (spec A-22): the union of the local days of
 * every given list of moments (walks, sessions, events, symptoms, ...). Sorted, without repeats.
 *
 * @throws RangeError for non-finite times or offsets.
 */
export function recordDays(...lists: readonly (readonly Moment[])[]): number[] {
  const days = new Set<number>();
  for (const list of lists) {
    for (const m of list) {
      assertFinite('moment', m.ts, m.tzOffsetMin);
      days.add(localDay(m.ts, m.tzOffsetMin));
    }
  }
  return [...days].sort((a, b) => a - b);
}

interface Chain {
  readonly count: number;
  readonly bridged: readonly number[];
}

/** Walks back from `start`, counting record days and spending the weekly pauses on gaps. */
function chainFrom(start: number, days: ReadonlySet<number>, floor: number, pauses: number): Chain {
  const usedPerWeek = new Map<number, number>();
  let count = 0;
  const bridged: number[] = [];
  let pending: number[] = [];
  for (let day = start; day >= floor; day--) {
    if (days.has(day)) {
      count += 1;
      bridged.push(...pending);
      pending = [];
      continue;
    }
    const week = weekOfLocalDay(day);
    const used = usedPerWeek.get(week) ?? 0;
    if (used >= pauses) {
      break;
    }
    usedPerWeek.set(week, used + 1);
    pending.push(day);
  }
  return { count, bridged: bridged.sort((a, b) => a - b) };
}

/**
 * Streak of days with a record (spec A-21, decision D-53). Rest days count like record days.
 * Missed days are forgiven by up to `pausesPerWeek` "paw pauses" per Monday-based week, spent on
 * the latest gaps first; the current day without a record yet is not a gap. Days after `today`
 * are ignored.
 *
 * @param recordDayList local days with a record (A-22), see {@link recordDays}
 * @param restDayList local days the owner marked as rest days
 * @param today the current local day
 * @throws RangeError for non-finite days or a negative number of pauses.
 */
export function computeStreak(
  recordDayList: readonly number[],
  restDayList: readonly number[],
  today: number,
  options: StreakOptions = {},
): StreakResult {
  const pauses = options.pausesPerWeek ?? PAUSES_PER_WEEK;
  if (!Number.isInteger(pauses) || pauses < 0) {
    throw new RangeError('pausesPerWeek must be an integer >= 0');
  }
  assertFinite('today', today);
  const all = [...recordDayList, ...restDayList];
  assertFinite('days', ...all);
  const days = new Set(all.filter((d) => d <= today));
  if (days.size === 0) {
    return { current: 0, best: 0, alive: false, bridgedDays: [] };
  }
  const floor = Math.min(...days);

  const start = days.has(today) ? today : today - 1;
  const current = chainFrom(start, days, floor, pauses);
  let best = 0;
  for (const day of days) {
    best = Math.max(best, chainFrom(day, days, floor, pauses).count);
  }
  return {
    current: current.count,
    best,
    alive: current.count > 0,
    bridgedDays: current.bridged,
  };
}
