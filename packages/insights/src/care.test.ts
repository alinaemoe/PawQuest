import { describe, expect, it } from 'vitest';

import { addMonths, dueStatus, inSeason, intervalStats, nextDue, reminderTimes } from './care';

const at = (y: number, m: number, d: number, h = 10, min = 0): number =>
  Date.UTC(y, m - 1, d, h, min);
const DAY = 86_400_000;

describe('addMonths', () => {
  it('adds calendar months and keeps the time of day', () => {
    expect(addMonths(at(2026, 7, 10, 10, 30), 3, 0)).toBe(at(2026, 10, 10, 10, 30));
    expect(addMonths(at(2025, 10, 15), 12, 0)).toBe(at(2026, 10, 15));
    expect(addMonths(at(2026, 11, 15), 3, 0)).toBe(at(2027, 2, 15));
    expect(addMonths(at(2026, 12, 31), 12, 0)).toBe(at(2027, 12, 31));
  });

  it('clamps to the end of a shorter month, leap years included', () => {
    expect(addMonths(at(2026, 1, 31), 1, 0)).toBe(at(2026, 2, 28));
    expect(addMonths(at(2024, 1, 31), 1, 0)).toBe(at(2024, 2, 29));
    expect(addMonths(at(2026, 8, 31), 1, 0)).toBe(at(2026, 9, 30));
  });

  it('works in the local calendar: 22:30 UTC on the 31st is already Feb 1 in Minsk', () => {
    // 2026-01-31 22:30Z is 2026-02-01 01:30 local (UTC+3); +1 month = 2026-03-01 01:30 local
    expect(addMonths(at(2026, 1, 31, 22, 30), 1, 180)).toBe(at(2026, 2, 28, 22, 30));
  });
});

describe('inSeason', () => {
  it('everything is in season without one', () => {
    expect(inSeason(at(2026, 1, 15), {}, 0)).toBe(true);
  });

  it('April to October, boundaries included', () => {
    const season = { seasonFromMonth: 4, seasonToMonth: 10 };
    expect(inSeason(at(2026, 3, 31), season, 0)).toBe(false);
    expect(inSeason(at(2026, 4, 1), season, 0)).toBe(true);
    expect(inSeason(at(2026, 10, 31, 23), season, 0)).toBe(true);
    expect(inSeason(at(2026, 11, 1), season, 0)).toBe(false);
  });

  it('a season that wraps the new year', () => {
    const season = { seasonFromMonth: 11, seasonToMonth: 3 };
    expect(inSeason(at(2026, 12, 20), season, 0)).toBe(true);
    expect(inSeason(at(2027, 2, 1), season, 0)).toBe(true);
    expect(inSeason(at(2027, 6, 1), season, 0)).toBe(false);
  });
});

describe('nextDue', () => {
  it('deworming every 3 months and vaccination every 12', () => {
    expect(nextDue({ intervalMonths: 3 }, at(2026, 7, 10), 0)).toBe(at(2026, 10, 10));
    expect(nextDue({ intervalMonths: 12 }, at(2025, 10, 15), 0)).toBe(at(2026, 10, 15));
  });

  it('days intervals count 24-hour days', () => {
    expect(nextDue({ intervalDays: 30 }, at(2026, 10, 1), 0)).toBe(at(2026, 10, 1) + 30 * DAY);
  });

  it('is null when it was never done', () => {
    expect(nextDue({ intervalMonths: 3 }, null, 0)).toBeNull();
  });

  it('ticks: in season the next date is plain, out of season it waits for spring', () => {
    const tick = { intervalDays: 30, seasonFromMonth: 4, seasonToMonth: 10 };
    expect(nextDue(tick, at(2026, 4, 5), 0)).toBe(at(2026, 5, 5));
    // 10 Oct + 30 days = 9 Nov: out of season, the plan sleeps until 1 April
    expect(nextDue(tick, at(2026, 10, 10), 0)).toBe(at(2027, 4, 1, 0));
    // 20 Mar + 30 days = 19 Apr is in season again
    expect(nextDue(tick, at(2026, 3, 20), 0)).toBe(at(2026, 3, 20) + 30 * DAY);
  });

  it('a season that wraps the year sleeps in the middle of the year', () => {
    const winter = { intervalDays: 30, seasonFromMonth: 11, seasonToMonth: 3 };
    expect(nextDue(winter, at(2026, 12, 20), 0)).toBe(at(2027, 1, 19));
    expect(nextDue(winter, at(2027, 3, 10), 0)).toBe(at(2027, 11, 1, 0));
  });

  it('the season start is a local midnight', () => {
    const tick = { intervalDays: 30, seasonFromMonth: 4, seasonToMonth: 10 };
    // UTC+3: local midnight of 1 April is 21:00Z on 31 March
    expect(nextDue(tick, at(2026, 10, 10), 180)).toBe(at(2027, 3, 31, 21));
  });

  it('rejects a schedule without an interval and non-finite input', () => {
    expect(() => nextDue({}, at(2026, 1, 1), 0)).toThrow(/interval/);
    expect(() => nextDue({ intervalDays: 0 }, at(2026, 1, 1), 0)).toThrow(/interval/);
    expect(() => nextDue({ intervalDays: 30 }, Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('dueStatus', () => {
  it('today, upcoming and overdue by whole calendar days', () => {
    const now = at(2026, 10, 15, 23);
    expect(dueStatus(at(2026, 10, 15, 8), now, 0)).toEqual({ kind: 'today', days: 0 });
    expect(dueStatus(at(2026, 10, 27), now, 0)).toEqual({ kind: 'upcoming', days: 12 });
    expect(dueStatus(at(2026, 10, 12), now, 0)).toEqual({ kind: 'overdue', days: 3 });
  });

  it('counts days in the local calendar', () => {
    // due 22:30Z on the 14th is the 15th in Minsk; now 00:30Z on the 15th is 03:30 local: same day
    expect(dueStatus(at(2026, 10, 14, 22, 30), at(2026, 10, 15, 0, 30), 180)).toEqual({
      kind: 'today',
      days: 0,
    });
    // one minute apart across local midnight: overdue by one day
    expect(dueStatus(at(2026, 10, 14, 20, 59), at(2026, 10, 14, 21, 1), 180)).toEqual({
      kind: 'overdue',
      days: 1,
    });
  });
});

describe('intervalStats', () => {
  it('median and range of the real gaps between treatments', () => {
    const base = at(2026, 1, 1);
    expect(intervalStats([base, base + 88 * DAY, base + 183 * DAY])).toEqual({
      n: 2,
      medianDays: 91.5,
      minDays: 88,
      maxDays: 95,
    });
  });

  it('sorts the dates and handles a single gap', () => {
    const base = at(2026, 1, 1);
    expect(intervalStats([base + 90 * DAY, base])).toEqual({
      n: 1,
      medianDays: 90,
      minDays: 90,
      maxDays: 90,
    });
  });

  it('is null with fewer than two dates', () => {
    expect(intervalStats([])).toBeNull();
    expect(intervalStats([at(2026, 1, 1)])).toBeNull();
  });
});

describe('reminderTimes', () => {
  const due = at(2026, 10, 15, 0);

  it('lists future reminder moments at 10:00 local, earliest first', () => {
    expect(reminderTimes(due, [0, 7], at(2026, 10, 1), 0)).toEqual([
      at(2026, 10, 8, 10),
      at(2026, 10, 15, 10),
    ]);
  });

  it('drops moments already in the past and duplicates', () => {
    expect(reminderTimes(due, [7, 0, 0], at(2026, 10, 9), 0)).toEqual([at(2026, 10, 15, 10)]);
    expect(reminderTimes(due, [7, 0], at(2026, 10, 20), 0)).toEqual([]);
  });

  it('uses the local clock and a chosen hour', () => {
    expect(reminderTimes(due, [0], at(2026, 10, 1), 180)).toEqual([at(2026, 10, 15, 7)]);
    expect(reminderTimes(due, [0], at(2026, 10, 1), 0, 18)).toEqual([at(2026, 10, 15, 18)]);
  });
});
