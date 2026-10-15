import { median } from '@pawquest/core';

import { assertFinite } from './time';

const DAY_MS = 86_400_000;

/** How often a care routine repeats, and when it sleeps (docs/17 §17.2). */
export interface CareSchedule {
  readonly intervalDays?: number | null;
  readonly intervalMonths?: number | null;
  /** Months 1..12. A season may wrap the new year (11 -> 3). Outside it the plan sleeps. */
  readonly seasonFromMonth?: number | null;
  readonly seasonToMonth?: number | null;
}

function parts(ts: number, offsetMin: number): { y: number; m: number; d: number; ms: number } {
  const local = new Date(ts + offsetMin * 60_000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    ms:
      ts +
      offsetMin * 60_000 -
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  };
}

function fromLocal(
  y: number,
  m: number,
  d: number,
  timeOfDayMs: number,
  offsetMin: number,
): number {
  return Date.UTC(y, m, d) + timeOfDayMs - offsetMin * 60_000;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Adds whole months in the local calendar; 31 Jan + 1 month is 28 (or 29) Feb, never 3 Mar. */
export function addMonths(ts: number, months: number, offsetMin: number): number {
  const { y, m, d, ms } = parts(ts, offsetMin);
  const total = m + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return fromLocal(year, month, Math.min(d, daysInMonth(year, month)), ms, offsetMin);
}

export function inSeason(ts: number, schedule: CareSchedule, offsetMin: number): boolean {
  const from = schedule.seasonFromMonth;
  const to = schedule.seasonToMonth;
  if (from === null || from === undefined || to === null || to === undefined) {
    return true;
  }
  const month = parts(ts, offsetMin).m + 1;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/** The first local midnight on or after `ts` that opens a season (day 1 of the "from" month). */
function nextSeasonStart(ts: number, from: number, offsetMin: number): number {
  const { y } = parts(ts, offsetMin);
  const thisYear = fromLocal(y, from - 1, 1, 0, offsetMin);
  return thisYear >= ts ? thisYear : fromLocal(y + 1, from - 1, 1, 0, offsetMin);
}

/**
 * When a routine is due next: the last time it was done plus its interval; if that moment falls
 * outside the season, the start of the next season. Null when it was never done (the owner then
 * says "today" or gives an approximate last date). The result keeps the time of day of the last
 * entry so a reminder time is stable.
 *
 * @throws RangeError for non-finite times or a schedule without an interval.
 */
export function nextDue(
  schedule: CareSchedule,
  lastDoneAt: number | null,
  offsetMin: number,
): number | null {
  if (lastDoneAt === null) {
    return null;
  }
  assertFinite('care time', lastDoneAt, offsetMin);
  const days = schedule.intervalDays ?? null;
  const months = schedule.intervalMonths ?? null;
  if ((days === null || days <= 0) && (months === null || months <= 0)) {
    throw new RangeError('A care schedule needs an interval in days or months');
  }
  const due =
    months !== null && months > 0
      ? addMonths(lastDoneAt, months, offsetMin)
      : lastDoneAt + (days ?? 0) * DAY_MS;
  if (inSeason(due, schedule, offsetMin)) {
    return due;
  }
  return nextSeasonStart(due, schedule.seasonFromMonth ?? 1, offsetMin);
}

export type DueKind = 'overdue' | 'today' | 'upcoming';

export interface DueStatus {
  readonly kind: DueKind;
  /** Whole calendar days: overdue by N, or N days left. 0 for today. */
  readonly days: number;
}

/** Calendar-day status: "due in 12 days", "today", "was due 3 days ago". Never judgemental (G-19). */
export function dueStatus(due: number, now: number, offsetMin: number): DueStatus {
  assertFinite('care time', due, now, offsetMin);
  const dayOf = (ts: number): number => Math.floor((ts + offsetMin * 60_000) / DAY_MS);
  const diff = dayOf(due) - dayOf(now);
  if (diff === 0) {
    return { kind: 'today', days: 0 };
  }
  return diff > 0 ? { kind: 'upcoming', days: diff } : { kind: 'overdue', days: -diff };
}

export interface IntervalStats {
  /** Number of intervals (dates minus one). */
  readonly n: number;
  readonly medianDays: number;
  readonly minDays: number;
  readonly maxDays: number;
}

/** Real gaps between the times a routine was done: "88-95 days, n = 3". Null with fewer than 2 dates. */
export function intervalStats(doneAt: readonly number[]): IntervalStats | null {
  if (doneAt.length < 2) {
    return null;
  }
  const sorted = [...doneAt].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(Math.round(((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)) / DAY_MS));
  }
  return {
    n: gaps.length,
    medianDays: median(gaps),
    minDays: Math.min(...gaps),
    maxDays: Math.max(...gaps),
  };
}

/**
 * Moments to notify for a due date: at `hour` local time on each "days before" day, only those
 * still in the future. The default hour is far from the quiet hours (22:00-07:00).
 */
export function reminderTimes(
  due: number,
  daysBefore: readonly number[],
  now: number,
  offsetMin: number,
  hour = 10,
): number[] {
  const { y, m, d } = parts(due, offsetMin);
  return [...new Set(daysBefore)]
    .map((before) => fromLocal(y, m, d - before, hour * 3_600_000, offsetMin))
    .filter((ts) => ts > now)
    .sort((a, b) => a - b);
}
