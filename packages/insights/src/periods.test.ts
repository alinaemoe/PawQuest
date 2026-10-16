import { describe, expect, it } from 'vitest';

import { comparePeriods, type ComparisonRow, type PeriodWalk } from './periods';

const walk = (extra: Partial<PeriodWalk> = {}): PeriodWalk => ({
  startedAt: 0,
  durationS: 1800,
  distanceM: 2000,
  hard: false,
  success: false,
  ...extra,
});
const many = (
  count: number,
  extra: (i: number) => Partial<PeriodWalk> = () => ({}),
): PeriodWalk[] => Array.from({ length: count }, (_, i) => walk(extra(i)));
const row = (rows: ComparisonRow[], key: string): ComparisonRow | undefined =>
  rows.find((r) => r.key === key);

describe('comparePeriods', () => {
  it('totals are plain counts: walks, time and distance, A minus B, with no label', () => {
    const rows = comparePeriods(
      many(8),
      many(5, () => ({ durationS: 600, distanceM: 500 })),
    );
    expect(row(rows, 'walks')).toMatchObject({ a: 8, b: 5, diff: 3, label: null });
    expect(row(rows, 'time')).toMatchObject({ a: 14_400, b: 3000, diff: 11_400, label: null });
    expect(row(rows, 'distance')).toMatchObject({ a: 16_000, b: 2500, diff: 13_500 });
  });

  it('the typical walk is compared by medians with a label', () => {
    const a = many(12, (i) => ({ durationS: 2400 + i * 30 }));
    const b = many(12, (i) => ({ durationS: 1200 + i * 30 }));
    const typical = row(comparePeriods(a, b), 'typicalWalk');
    expect(typical?.diff).toBe(1200);
    expect(typical?.label).toBe('noticeable');
    expect(typical).toMatchObject({ nA: 12, nB: 12 });
  });

  it('shares of walks with a hard moment: counts, intervals and a label', () => {
    const a = many(10, (i) => ({ hard: i < 7 }));
    const b = many(10, (i) => ({ hard: i < 1 }));
    const hard = row(comparePeriods(a, b), 'hard');
    expect(hard).toMatchObject({ a: 0.7, b: 0.1, nA: 10, nB: 10 });
    expect(hard?.diff).toBeCloseTo(0.6, 10);
    expect(hard?.intervalA?.n).toBe(10);
    expect(['noticeable', 'possible']).toContain(hard?.label);
  });

  it('walks where it is not known are not counted, and without any the row says "not enough"', () => {
    const a = [walk({ hard: true }), walk({ hard: undefined }), walk({ hard: undefined })];
    const b = many(6, () => ({ hard: false }));
    const hard = row(comparePeriods(a, b), 'hard');
    expect(hard).toMatchObject({ nA: 1, nB: 6, a: 1, b: 0, label: 'insufficient' });
    const none = row(
      comparePeriods(
        many(3, () => ({ success: undefined })),
        b,
      ),
      'success',
    );
    expect(none).toMatchObject({
      a: null,
      diff: null,
      nA: 0,
      label: 'insufficient',
      intervalA: null,
    });
  });

  it('few walks in a period: nothing is concluded (the smaller group under five)', () => {
    const rows = comparePeriods(
      many(4, () => ({ hard: true })),
      many(9, () => ({ hard: false })),
    );
    expect(row(rows, 'hard')?.label).toBe('insufficient');
  });

  it('an empty period still gives every row, with unknown where it cannot be told', () => {
    const rows = comparePeriods([], many(5));
    expect(rows.map((r) => r.key)).toEqual([
      'walks',
      'time',
      'distance',
      'typicalWalk',
      'hard',
      'success',
    ]);
    expect(row(rows, 'walks')).toMatchObject({ a: 0, b: 5, diff: -5 });
    expect(row(rows, 'typicalWalk')).toMatchObject({ a: null, diff: null, label: 'insufficient' });
    expect(comparePeriods([], [])[3]).toMatchObject({ a: null, b: null });
  });

  it('a walk of unknown length adds nothing to time and distance but counts as a walk', () => {
    const rows = comparePeriods([walk({ durationS: null, distanceM: null })], [walk()]);
    expect(row(rows, 'walks')?.a).toBe(1);
    expect(row(rows, 'time')?.a).toBe(0);
    expect(row(rows, 'typicalWalk')?.a).toBeNull();
  });
});
