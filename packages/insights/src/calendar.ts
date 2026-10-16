import { localDay, weekOfLocalDay } from './time';

/**
 * The calendar of weeks (docs/23, step 3.8): one cell per local day, its colour by how long the
 * dog walked that day. The bands are fixed (the same for every dog and every month, so two days
 * can be compared by eye) and they say nothing about whether a day was good or bad.
 */

export interface CalendarWalk {
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
}

export interface CalendarDay {
  /** Local day number, days since 1970-01-01. */
  readonly day: number;
  readonly walks: number;
  readonly durationS: number;
  readonly distanceM: number;
  /** 0 = no walk, 1..4 = more and more time on foot. */
  readonly level: 0 | 1 | 2 | 3 | 4;
}

/** Walking time that makes a day level 2, 3 and 4 (level 1 is anything under the first). */
export const CALENDAR_BANDS_S = [20 * 60, 45 * 60, 90 * 60] as const;

/** The level of a day from the time walked on it. A walk of unknown length still makes level 1. */
export function dayLevel(walks: number, durationS: number): 0 | 1 | 2 | 3 | 4 {
  if (walks === 0) {
    return 0;
  }
  const [a, b, c] = CALENDAR_BANDS_S;
  return durationS >= c ? 4 : durationS >= b ? 3 : durationS >= a ? 2 : 1;
}

/** The Monday on or before a local day. */
export function mondayOf(day: number): number {
  return weekOfLocalDay(day) * 7 - 3;
}

/**
 * Every local day from `fromDay` to `toDay` (inclusive), also the ones without a walk. Walks are
 * placed on their own local day by the offset they were recorded with.
 */
export function calendarDays(
  walks: readonly CalendarWalk[],
  fromDay: number,
  toDay: number,
): CalendarDay[] {
  const byDay = new Map<number, { walks: number; durationS: number; distanceM: number }>();
  for (const walk of walks) {
    const day = localDay(walk.startedAt, walk.tzOffsetMin);
    if (day < fromDay || day > toDay) {
      continue;
    }
    const entry = byDay.get(day) ?? { walks: 0, durationS: 0, distanceM: 0 };
    entry.walks += 1;
    entry.durationS += walk.durationS ?? 0;
    entry.distanceM += walk.distanceM ?? 0;
    byDay.set(day, entry);
  }
  const days: CalendarDay[] = [];
  for (let day = fromDay; day <= toDay; day += 1) {
    const entry = byDay.get(day) ?? { walks: 0, durationS: 0, distanceM: 0 };
    days.push({ day, ...entry, level: dayLevel(entry.walks, entry.durationS) });
  }
  return days;
}

export interface CalendarWeek {
  /** The Monday of the week, as a local day number. */
  readonly mondayDay: number;
  /** Seven days, Monday first; a day outside the range given is `null`. */
  readonly days: readonly (CalendarDay | null)[];
}

/** The last `weeks` weeks up to the one that holds `today`, oldest first, Monday-first rows. */
export function calendarWeeks(
  walks: readonly CalendarWalk[],
  today: number,
  weeks: number,
): CalendarWeek[] {
  const lastMonday = mondayOf(today);
  const firstMonday = lastMonday - (weeks - 1) * 7;
  const days = calendarDays(walks, firstMonday, lastMonday + 6);
  return Array.from({ length: weeks }, (_, w) => {
    const mondayDay = firstMonday + w * 7;
    return {
      mondayDay,
      // days after today are not lived yet: they are left empty, not shown as "no walk"
      days: days.slice(w * 7, w * 7 + 7).map((d) => (d.day > today ? null : d)),
    };
  });
}
