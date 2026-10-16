import { describe, expect, it } from 'vitest';

import {
  CALENDAR_BANDS_S,
  calendarDays,
  calendarWeeks,
  dayLevel,
  mondayOf,
  type CalendarWalk,
} from './calendar';
import { localDay } from './time';

const DAY = 86_400_000;
const MINSK = 180;
// Monday 12 Oct 2026, 08:00 in Minsk
const MONDAY = Date.UTC(2026, 9, 12, 5, 0);
const monday = localDay(MONDAY, MINSK);

const walk = (
  dayOffset: number,
  minutes: number | null,
  extra: Partial<CalendarWalk> = {},
): CalendarWalk => ({
  startedAt: MONDAY + dayOffset * DAY,
  tzOffsetMin: MINSK,
  durationS: minutes === null ? null : minutes * 60,
  distanceM: 1000,
  ...extra,
});

describe('dayLevel', () => {
  it('no walk is level 0, then four bands with each lower edge in the higher one', () => {
    expect(dayLevel(0, 0)).toBe(0);
    expect(dayLevel(1, 0)).toBe(1);
    const [a, b, c] = CALENDAR_BANDS_S;
    expect([a - 1, a, b - 1, b, c - 1, c].map((s) => dayLevel(1, s))).toEqual([1, 2, 2, 3, 3, 4]);
  });
});

describe('mondayOf', () => {
  it('is the Monday on or before a day', () => {
    expect(mondayOf(monday)).toBe(monday);
    expect(mondayOf(monday + 6)).toBe(monday);
    expect(mondayOf(monday + 7)).toBe(monday + 7);
    expect(mondayOf(monday - 1)).toBe(monday - 7);
    expect(mondayOf(0)).toBe(-3); // 1 Jan 1970 was a Thursday
  });
});

describe('calendarDays', () => {
  it('every day of the range, with the walks of that day added up', () => {
    const days = calendarDays([walk(0, 30), walk(0, 20), walk(2, 100)], monday, monday + 3);
    expect(days.map((d) => d.day)).toEqual([monday, monday + 1, monday + 2, monday + 3]);
    expect(days[0]).toEqual({ day: monday, walks: 2, durationS: 3000, distanceM: 2000, level: 3 });
    expect(days[1]).toMatchObject({ walks: 0, level: 0 });
    expect(days[2]).toMatchObject({ walks: 1, level: 4 });
  });

  it('a walk goes to the local day it was recorded on: Sunday night UTC is Monday in Minsk', () => {
    const late = walk(0, 30, { startedAt: Date.UTC(2026, 9, 11, 22, 30) });
    const days = calendarDays([late], monday - 1, monday);
    expect(days.map((d) => d.walks)).toEqual([0, 1]);
    const utc = calendarDays([{ ...late, tzOffsetMin: 0 }], monday - 1, monday);
    expect(utc.map((d) => d.walks)).toEqual([1, 0]);
  });

  it('walks outside the range are left out, a walk of unknown length still colours its day', () => {
    const days = calendarDays([walk(-5, 30), walk(9, 30), walk(1, null)], monday, monday + 2);
    expect(days.map((d) => d.walks)).toEqual([0, 1, 0]);
    expect(days[1]?.level).toBe(1);
  });

  it('an empty range of one day, and no walks at all', () => {
    expect(calendarDays([], monday, monday)).toEqual([
      { day: monday, walks: 0, durationS: 0, distanceM: 0, level: 0 },
    ]);
    expect(calendarDays([], monday + 1, monday)).toEqual([]);
  });
});

describe('calendarWeeks', () => {
  const today = monday + 9; // Wednesday of the week after

  it('the last weeks, Monday first, ending with the week that holds today', () => {
    const weeks = calendarWeeks([walk(0, 30), walk(8, 60)], today, 3);
    expect(weeks.map((w) => w.mondayDay)).toEqual([monday - 7, monday, monday + 7]);
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(weeks[1]?.days[0]).toMatchObject({ day: monday, walks: 1 });
    expect(weeks[2]?.days[1]).toMatchObject({ day: monday + 8, walks: 1, level: 3 });
  });

  it('days after today are empty cells, not "no walk"', () => {
    const weeks = calendarWeeks([], today, 1);
    expect(weeks[0]?.days.map((d) => d !== null)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('a week or more of nothing is still a full grid', () => {
    const weeks = calendarWeeks([], today, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks.flatMap((w) => w.days).filter((d) => d !== null && d.walks > 0)).toEqual([]);
    expect(calendarWeeks([], today, 0)).toEqual([]);
  });
});
