import { describe, expect, it } from 'vitest';

import {
  HIGH_LOAD_PERCENTILE,
  LOAD_WINDOW_DAYS,
  MIN_LOAD_DAYS,
  dailyLoads,
  isHighLoad,
  loadPercentile,
  reactionMultiplier,
  type DayLoad,
  type LoadEvent,
} from './load';

const DAY = 86_400_000;

function ev(day: number, kind: string, typeId: string, reaction?: number, hour = 12): LoadEvent {
  const base = { ts: day * DAY + hour * 3_600_000, tzOffsetMin: 0, kind, typeId };
  return reaction === undefined ? base : { ...base, reaction };
}

describe('constants', () => {
  it('match the spec', () => {
    expect(HIGH_LOAD_PERCENTILE).toBe(85);
    expect(LOAD_WINDOW_DAYS).toBe(90);
    expect(MIN_LOAD_DAYS).toBe(14);
  });
});

describe('reactionMultiplier', () => {
  it.each([
    [undefined, 1],
    [1, 1],
    [2, 1.25],
    [3, 1.5],
    [5, 2],
  ])('maps reaction %s to %s', (reaction, expected) => {
    expect(reactionMultiplier(reaction)).toBe(expected);
  });

  it.each([0, 5.5, Number.NaN, -1])('rejects the reaction %s', (bad) => {
    expect(() => reactionMultiplier(bad)).toThrow(RangeError);
  });
});

describe('dailyLoads (A-08)', () => {
  it('sums weight times reaction multiplier of trigger events per local day', () => {
    const events = [
      ev(10, 'trigger', 'dog', 3), // 1.5
      ev(10, 'trigger', 'person'), // 1
      ev(10, 'trigger', 'dog', 5), // 2
      ev(11, 'trigger', 'child', 1), // 1
    ];
    expect(dailyLoads(events)).toEqual([
      { day: 10, load: 4.5 },
      { day: 11, load: 1 },
    ]);
  });

  it('ignores events that are not triggers, even with an invalid shape of reaction check first', () => {
    const events = [
      ev(10, 'outcome', 'success'),
      ev(10, 'action', 'exercise'),
      ev(10, 'trigger', 'dog'),
    ];
    expect(dailyLoads(events)).toEqual([{ day: 10, load: 1 }]);
  });

  it('uses per-type weights and a configurable default weight', () => {
    const events = [
      ev(10, 'trigger', 'dog'),
      ev(10, 'trigger', 'child'),
      ev(10, 'trigger', 'bike'),
    ];
    const loads = dailyLoads(events, { weights: { child: 2, dog: 0.5 }, defaultWeight: 3 });
    expect(loads).toEqual([{ day: 10, load: 0.5 + 2 + 3 }]);
  });

  it('adds tracked days without triggers as zero and sorts by day', () => {
    const loads = dailyLoads([ev(12, 'trigger', 'dog')], { trackedDays: [14, 12, 10] });
    expect(loads).toEqual([
      { day: 10, load: 0 },
      { day: 12, load: 1 },
      { day: 14, load: 0 },
    ]);
  });

  it('assigns events to the local day of their own offset', () => {
    const late: LoadEvent = {
      ts: 10 * DAY + 22 * 3_600_000,
      tzOffsetMin: 180,
      kind: 'trigger',
      typeId: 'dog',
    };
    expect(dailyLoads([late])).toEqual([{ day: 11, load: 1 }]);
  });

  it('rejects invalid input', () => {
    expect(() => dailyLoads([{ ...ev(1, 'trigger', 'dog'), ts: Number.NaN }])).toThrow(RangeError);
    expect(() => dailyLoads([ev(1, 'trigger', 'dog', 9)])).toThrow(RangeError);
    expect(() => dailyLoads([], { defaultWeight: -1 })).toThrow(RangeError);
    expect(() => dailyLoads([ev(1, 'trigger', 'dog')], { weights: { dog: -2 } })).toThrow(
      RangeError,
    );
    expect(() => dailyLoads([], { trackedDays: [Number.NaN] })).toThrow(RangeError);
  });
});

function daysWithLoads(loads: readonly number[], firstDay = 100): DayLoad[] {
  return loads.map((load, i): DayLoad => ({ day: firstDay + i, load }));
}

describe('loadPercentile', () => {
  const fourteen = daysWithLoads([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

  it('is not shown with fewer than 14 tracked days', () => {
    const r = loadPercentile(112, 5, daysWithLoads([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
    expect(r).toEqual({ percentile: null, daysUsed: 13 });
  });

  it('uses the mid-rank: (less + half of equal) / days', () => {
    // load 13 is the largest of 14 values: less = 13, equal = 1 -> 13.5 / 14
    expect(loadPercentile(113, 13, fourteen).percentile).toBeCloseTo((13.5 / 14) * 100, 9);
    // load 0 is the smallest: 0.5 / 14
    expect(loadPercentile(113, 0, fourteen).percentile).toBeCloseTo((0.5 / 14) * 100, 9);
  });

  it('puts a value above all days at 100 and below all days at 0', () => {
    expect(loadPercentile(113, 99, fourteen).percentile).toBe(100);
    expect(loadPercentile(113, -1, fourteen).percentile).toBe(0);
  });

  it('counts ties as half: all equal loads give the 50th percentile', () => {
    expect(loadPercentile(113, 2, daysWithLoads(new Array<number>(14).fill(2))).percentile).toBe(
      50,
    );
  });

  it('looks only at the 90 days up to and including today', () => {
    const old = daysWithLoads(new Array<number>(30).fill(100), 0); // days 0..29, outside the window
    const recent = daysWithLoads([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 200);
    const future = daysWithLoads([50, 50], 300);
    const r = loadPercentile(213, 14, [...old, ...recent, ...future]);
    expect(r.daysUsed).toBe(14);
    expect(r.percentile).toBeCloseTo((13.5 / 14) * 100, 9);
    // the window is (today - 90, today]: with today = 100, day 10 is out and day 11 is in
    const lowerEdge = daysWithLoads(new Array<number>(15).fill(1), 10); // days 10..24
    expect(loadPercentile(100, 1, lowerEdge).daysUsed).toBe(14);
    // day 100 (today) is in, day 101 (tomorrow) is out
    const upperEdge = daysWithLoads(new Array<number>(15).fill(1), 87); // days 87..101
    expect(loadPercentile(100, 1, upperEdge).daysUsed).toBe(14);
  });

  it('rejects non-finite arguments', () => {
    expect(() => loadPercentile(Number.NaN, 1, [])).toThrow(RangeError);
  });
});

describe('isHighLoad', () => {
  it('is true strictly above the 85th percentile', () => {
    expect(isHighLoad(85)).toBe(false);
    expect(isHighLoad(85.1)).toBe(true);
    expect(isHighLoad(100)).toBe(true);
    expect(isHighLoad(null)).toBe(false);
  });
});
