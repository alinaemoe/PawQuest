import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PAUSES_PER_WEEK, computeStreak, recordDays } from './streak';

/** A Monday as a local day number (days since 1970-01-01): checked below. */
const MON = 6997;
const [TUE, WED, THU, FRI, SAT, SUN] = [1, 2, 3, 4, 5, 6].map((d) => MON + d) as [
  number,
  number,
  number,
  number,
  number,
  number,
];

describe('calendar assumptions of these tests', () => {
  it('uses a real Monday', () => {
    expect(new Date(MON * 86_400_000).getUTCDay()).toBe(1);
    expect(new Date(SUN * 86_400_000).getUTCDay()).toBe(0);
  });
});

describe('recordDays (A-22)', () => {
  it('merges the local days of several sources, sorted and without repeats', () => {
    const at = (day: number, hour: number) => ({
      ts: day * 86_400_000 + hour * 3_600_000,
      tzOffsetMin: 0,
    });
    const days = recordDays([at(10, 8), at(10, 20)], [at(9, 12)], [at(12, 1)], []);
    expect(days).toEqual([9, 10, 12]);
  });

  it('uses the local day of each moment and rejects non-finite input', () => {
    const late = { ts: 10 * 86_400_000 + 22 * 3_600_000, tzOffsetMin: 180 };
    expect(recordDays([late])).toEqual([11]);
    expect(() => recordDays([{ ts: Number.NaN, tzOffsetMin: 0 }])).toThrow(RangeError);
  });
});

describe('computeStreak (A-21, D-53)', () => {
  it('has the spec default of 2 pauses per week', () => {
    expect(PAUSES_PER_WEEK).toBe(2);
  });

  it('is empty without records', () => {
    expect(computeStreak([], [], SUN)).toEqual({
      current: 0,
      best: 0,
      alive: false,
      bridgedDays: [],
    });
  });

  it('counts consecutive days including today', () => {
    const r = computeStreak([MON, TUE, WED, THU, FRI], [], FRI);
    expect(r).toMatchObject({ current: 5, best: 5, alive: true, bridgedDays: [] });
  });

  it('does not treat a today without a record yet as a miss', () => {
    expect(computeStreak([MON, TUE, WED], [], THU).current).toBe(3);
  });

  it('counts rest days like record days', () => {
    expect(computeStreak([MON, TUE, THU], [WED], THU).current).toBe(4);
  });

  it('bridges one missed day with a paw pause but does not count it (the prototype week)', () => {
    // Mon done, Tue done, Wed rest, Thu done, Fri missed, Sat done, today Sunday not yet.
    const r = computeStreak([MON, TUE, THU, SAT], [WED], SUN);
    expect(r.current).toBe(5);
    expect(r.alive).toBe(true);
    expect(r.bridgedDays).toEqual([FRI]);
  });

  it('cannot connect across three missed days in one week (only two pauses)', () => {
    // Mon, [Tue Wed Thu missed], Fri, Sat; today Sat. Monday is out of reach, the chain is
    // Fri + Sat, and no gap inside it needed a pause.
    const r = computeStreak([MON, FRI, SAT], [], SAT);
    expect(r.current).toBe(2);
    expect(r.bridgedDays).toEqual([]);
    expect(r.best).toBe(2);
  });

  it('connects across exactly two missed days and reports them as bridged', () => {
    // Mon, [Tue Wed missed], Thu, Fri, Sat: both gaps are forgiven, Monday counts.
    const r = computeStreak([MON, THU, FRI, SAT], [], SAT);
    expect(r.current).toBe(4);
    expect(r.bridgedDays).toEqual([TUE, WED]);
  });

  it('spends the pauses on the latest gaps first when there are more gaps than pauses', () => {
    // Mon, [Tue missed], Wed, [Thu missed], Fri, [Sat missed]; today Sun (no record yet).
    // Walking back: Sat -> pause 1, Fri record, Thu -> pause 2, Wed record, Tue -> no pause left.
    const r = computeStreak([MON, WED, FRI], [], SUN);
    expect(r.current).toBe(2); // Fri and Wed; Monday is not reachable
    // Thu (between two records) and Sat (the tail gap since the latest record) were forgiven.
    expect(r.bridgedDays).toEqual([THU, SAT]);
  });

  it('keeps separate pause budgets per calendar week', () => {
    const prevSat = MON - 2;
    const prevSun = MON - 1;
    // last week Sat and Sun missed (week B budget), this week Mon record, Tue and Wed missed
    // (week A budget), Thu record.
    const r = computeStreak([prevSat - 1, MON, THU], [], THU);
    expect(r.current).toBe(3);
    expect(r.bridgedDays).toEqual([prevSat, prevSun, TUE, WED]);
  });

  it('breaks the streak when the unforgiven gap is at the end (3 missed days since the last record)', () => {
    const r = computeStreak([MON, TUE], [], FRI); // Wed, Thu missed (bridged), Fri today pending
    expect(r.current).toBe(2);
    const broken = computeStreak([MON], [], FRI); // Tue, Wed, Thu missed: third has no pause left
    expect(broken.current).toBe(0);
    expect(broken.alive).toBe(false);
    expect(broken.best).toBe(1);
  });

  it('remembers the best streak after the current one is broken', () => {
    const r = computeStreak([MON, TUE, WED, THU, FRI], [], SUN + 10);
    expect(r.current).toBe(0);
    expect(r.best).toBe(5);
  });

  it('ignores days after today', () => {
    expect(computeStreak([MON, TUE, WED], [], TUE).current).toBe(2);
  });

  it('forgives nothing when pausesPerWeek is 0', () => {
    expect(computeStreak([MON, WED], [], WED, { pausesPerWeek: 0 }).current).toBe(1);
  });

  it('rejects invalid input', () => {
    expect(() => computeStreak([Number.NaN], [], MON)).toThrow(RangeError);
    expect(() => computeStreak([MON], [], Number.NaN)).toThrow(RangeError);
    expect(() => computeStreak([MON], [], MON, { pausesPerWeek: -1 })).toThrow(RangeError);
    expect(() => computeStreak([MON], [], MON, { pausesPerWeek: 1.5 })).toThrow(RangeError);
  });

  it('property: current never exceeds best, and adding a record day never lowers either', () => {
    const daysArb = fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { maxLength: 30 });
    fc.assert(
      fc.property(
        daysArb,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 30, max: 45 }),
        (days, extra, today) => {
          const base = computeStreak(days, [], today);
          expect(base.current).toBeLessThanOrEqual(base.best);
          const more = computeStreak([...days, extra], [], today);
          expect(more.best).toBeGreaterThanOrEqual(base.best);
        },
      ),
    );
  });
});
