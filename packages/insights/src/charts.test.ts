import { describe, expect, it } from 'vitest';

import { groupShares, groupSpreads, weeklyBars, type ChartWalk } from './charts';
import { localDay } from './time';

const DAY = 86_400_000;
const MINSK = 180;
const FRIDAY = Date.UTC(2026, 9, 16, 9);
const today = localDay(FRIDAY, MINSK);

const walk = (dayOffset: number, minutes: number, ground?: string): ChartWalk => ({
  startedAt: FRIDAY + dayOffset * DAY,
  tzOffsetMin: MINSK,
  durationS: minutes * 60,
  ground,
});

describe('weeklyBars', () => {
  it('a bar per week, the week of today last, with the time on wet ground apart', () => {
    const bars = weeklyBars(
      [walk(0, 30, 'wet'), walk(-1, 20, 'dry'), walk(-5, 60, 'snow'), walk(-13, 45), walk(-30, 99)],
      today,
      3,
    );
    expect(bars).toHaveLength(3);
    expect(bars[2]).toMatchObject({ walks: 2, durationS: 3000, wetDurationS: 1800 });
    expect(bars[1]).toMatchObject({ walks: 1, durationS: 3600, wetDurationS: 3600 });
    expect(bars[0]).toMatchObject({ walks: 1, durationS: 2700, wetDurationS: 0 });
    expect(bars.map((b) => b.mondayDay)).toEqual([today - 4 - 14, today - 4 - 7, today - 4]);
  });

  it('walks outside the weeks and after today are left out; weeks without walks are zero bars', () => {
    const bars = weeklyBars([walk(3, 30), walk(-100, 30)], today, 2);
    expect(bars.map((b) => b.walks)).toEqual([0, 0]);
    expect(weeklyBars([], today, 0)).toEqual([]);
  });

  it('a walk of unknown length is a walk with no time', () => {
    const bars = weeklyBars([{ ...walk(0, 0), durationS: null }], today, 1);
    expect(bars[0]).toMatchObject({ walks: 1, durationS: 0 });
  });
});

describe('groupShares', () => {
  const unit = (place: string | undefined, hard: boolean | undefined) => ({
    dims: { place_kind: place },
    outcomes: { hard_moment: hard },
  });
  const units = [
    ...Array.from({ length: 6 }, (_, i) => unit('green', i < 3)),
    ...Array.from({ length: 3 }, () => unit('streets', true)),
    unit('green', undefined),
    unit(undefined, true),
  ];

  it('a bar per level in the order given: counts, the interval, and whether it is enough', () => {
    const bars = groupShares(units, 'place_kind', 'hard_moment', ['streets', 'green', 'water']);
    expect(bars.map((b) => [b.value, b.k, b.n, b.enough])).toEqual([
      ['streets', 3, 3, false],
      ['green', 3, 6, true],
    ]);
    expect(bars[1]?.interval?.p).toBe(0.5);
  });

  it('the smallest enough group can be changed, and nothing at all gives no bars', () => {
    expect(groupShares(units, 'place_kind', 'hard_moment', ['streets'], 3)[0]?.enough).toBe(true);
    expect(groupShares([], 'place_kind', 'hard_moment', ['green'])).toEqual([]);
  });
});

describe('groupSpreads', () => {
  const item = (level: string | undefined, x: number | null) => ({ level, x });

  it('median and the middle half per level, marked when there are few', () => {
    const bars = groupSpreads(
      [
        ...[10, 20, 30, 40, 50].map((x) => item('0_10', x)),
        item('10_20', 60),
        item('10_20', 70),
        item('10_20', null),
        item(undefined, 5),
        item('0_10', Number.NaN),
      ],
      ['0_10', '10_20', 'over_25'],
    );
    expect(bars).toEqual([
      { value: '0_10', n: 5, median: 30, q1: 20, q3: 40, enough: true },
      { value: '10_20', n: 2, median: 65, q1: 62.5, q3: 67.5, enough: false },
    ]);
  });

  it('no values, no bars', () => {
    expect(groupSpreads([], ['a'])).toEqual([]);
  });
});
