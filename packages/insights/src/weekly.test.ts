import { describe, expect, it } from 'vitest';

import { MIN_PER_WEEK, weekIndex, weeklySeries, type DatedValue } from './weekly';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** UTC timestamp of a calendar moment. */
function utc(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h, min);
}

describe('weekIndex', () => {
  it('starts weeks on Monday: the dates used below really are a Monday and a Sunday', () => {
    expect(new Date(utc(2026, 10, 12)).getUTCDay()).toBe(1); // Monday
    expect(new Date(utc(2026, 10, 11)).getUTCDay()).toBe(0); // Sunday
  });

  it('puts Sunday 23:59 and the following Monday 00:00 into consecutive weeks', () => {
    const sunday = weekIndex(utc(2026, 10, 11, 23, 59), 0);
    const monday = weekIndex(utc(2026, 10, 12, 0, 0), 0);
    expect(monday).toBe(sunday + 1);
  });

  it('keeps Monday to Sunday in one week', () => {
    const monday = weekIndex(utc(2026, 10, 12), 0);
    for (let d = 0; d < 7; d++) {
      expect(weekIndex(utc(2026, 10, 12) + d * DAY + 12 * HOUR, 0)).toBe(monday);
    }
  });

  it('uses the local day: the same instant can fall into different weeks in different zones', () => {
    const instant = utc(2026, 10, 11, 22, 0); // Sunday 22:00 UTC
    expect(weekIndex(instant, 0)).toBe(weekIndex(utc(2026, 10, 11), 0));
    expect(weekIndex(instant, 180)).toBe(weekIndex(utc(2026, 10, 12), 0)); // Moscow: already Monday
  });

  it('counts 1970-01-01 (a Thursday) as week 0 and the Monday before it too', () => {
    expect(weekIndex(0, 0)).toBe(0);
    expect(weekIndex(Date.UTC(1969, 11, 29), 0)).toBe(0); // Monday 1969-12-29
    expect(weekIndex(Date.UTC(1969, 11, 28), 0)).toBe(-1); // Sunday before
  });
});

describe('weeklySeries', () => {
  const at = (day: number, value: number, tz = 0): DatedValue => ({
    ts: utc(2026, 10, 5) + day * DAY + 10 * HOUR, // day 0 = Monday 2026-10-05
    tzOffsetMin: tz,
    value,
  });

  it('takes the median per week and keeps only weeks with at least 3 observations', () => {
    expect(MIN_PER_WEEK).toBe(3);
    const obs = [
      at(0, 10),
      at(2, 30),
      at(4, 20), // week A: 10, 30, 20 -> median 20
      at(7, 5),
      at(9, 6), // week B: only 2 observations -> dropped
      at(14, 1),
      at(15, 2),
      at(16, 3),
      at(20, 100), // week C: 1, 2, 3, 100 -> median 2.5
    ];
    const result = weeklySeries(obs);
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBe(20);
    expect(result[1]?.x).toBe(2.5);
    expect((result[1]?.t ?? 0) - (result[0]?.t ?? 0)).toBe(2);
  });

  it('sorts the output by week regardless of input order', () => {
    const obs = [at(14, 1), at(15, 2), at(16, 3), at(0, 10), at(1, 20), at(2, 30)];
    const result = weeklySeries(obs);
    expect(result.map((p) => p.x)).toEqual([20, 2]);
  });

  it('honours a custom minimum', () => {
    const obs = [at(0, 1), at(1, 2)];
    expect(weeklySeries(obs)).toEqual([]);
    expect(weeklySeries(obs, 2)).toHaveLength(1);
  });

  it('returns nothing for no observations and rejects non-finite input', () => {
    expect(weeklySeries([])).toEqual([]);
    expect(() => weeklySeries([{ ts: Number.NaN, tzOffsetMin: 0, value: 1 }])).toThrow(RangeError);
    expect(() => weeklySeries([{ ts: 0, tzOffsetMin: Number.NaN, value: 1 }])).toThrow(RangeError);
    expect(() =>
      weeklySeries([{ ts: 0, tzOffsetMin: 0, value: Number.POSITIVE_INFINITY }]),
    ).toThrow(RangeError);
  });
});
