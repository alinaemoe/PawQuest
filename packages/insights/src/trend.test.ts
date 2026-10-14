import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MIN_TREND_POINTS,
  analyzeTrend,
  mannKendallZ,
  theilSenSlope,
  trendLabel,
  type SeriesPoint,
} from './trend';

function series(values: readonly number[]): SeriesPoint[] {
  return values.map((x, t) => ({ t, x }));
}

describe('theilSenSlope', () => {
  it('recovers the slope of an exact line', () => {
    expect(theilSenSlope(series([1, 3, 5, 7, 9, 11]))).toBeCloseTo(2, 12);
  });

  it('is robust against a single outlier', () => {
    const slope = theilSenSlope(series([1, 2, 3, 40, 5, 6, 7, 8]));
    expect(slope).toBeCloseTo(1, 12);
  });

  it('uses the time axis, not the index', () => {
    const points = [
      { t: 0, x: 0 },
      { t: 10, x: 5 },
      { t: 20, x: 10 },
    ];
    expect(theilSenSlope(points)).toBeCloseTo(0.5, 12);
  });

  it('skips pairs with the same t, sorts unsorted input and returns null without a usable pair', () => {
    expect(
      theilSenSlope([
        { t: 1, x: 1 },
        { t: 1, x: 9 },
      ]),
    ).toBeNull();
    expect(theilSenSlope([])).toBeNull();
    const shuffled = [
      { t: 2, x: 4 },
      { t: 0, x: 0 },
      { t: 1, x: 2 },
    ];
    expect(theilSenSlope(shuffled)).toBeCloseTo(2, 12);
  });

  it('rejects non-finite values', () => {
    expect(() => theilSenSlope([{ t: 0, x: Number.NaN }])).toThrow(RangeError);
    expect(() => theilSenSlope([{ t: Number.POSITIVE_INFINITY, x: 0 }])).toThrow(RangeError);
  });
});

describe('mannKendallZ', () => {
  it('gives Z = 14 / sqrt(28.33) = 2.630 for six strictly increasing values (checked by hand)', () => {
    expect(mannKendallZ(series([1, 2, 3, 4, 5, 6]))).toBeCloseTo(2.6304, 3);
  });

  it('is the mirror image for a decreasing series', () => {
    expect(mannKendallZ(series([6, 5, 4, 3, 2, 1]))).toBeCloseTo(-2.6304, 3);
  });

  it('applies the tie correction: [1,1,2,2,3,3] has S=12, Var=25.33, Z=2.185 (checked by hand)', () => {
    expect(mannKendallZ(series([1, 1, 2, 2, 3, 3]))).toBeCloseTo(2.1851, 3);
  });

  it('is 0 for a constant series and for a perfectly balanced one', () => {
    expect(mannKendallZ(series([4, 4, 4, 4, 4, 4]))).toBe(0);
    expect(mannKendallZ(series([1, 3, 2, 2, 3, 1]))).toBe(0);
  });

  it('is 0 for fewer than two points', () => {
    expect(mannKendallZ([])).toBe(0);
    expect(mannKendallZ(series([5]))).toBe(0);
  });

  it('property: reversing the order of values flips the sign of Z', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -50, max: 50 }), { minLength: 2, maxLength: 30 }),
        (values) => {
          const z = mannKendallZ(series(values));
          const mirrored = mannKendallZ(series([...values].reverse()));
          expect(mirrored).toBeCloseTo(-z, 9);
        },
      ),
    );
  });
});

describe('trendLabel', () => {
  it('uses the spec thresholds 1.28 and 1.96 on the absolute value', () => {
    expect(trendLabel(1.96)).toBe('clear');
    expect(trendLabel(-2.5)).toBe('clear');
    expect(trendLabel(1.95)).toBe('possible');
    expect(trendLabel(-1.28)).toBe('possible');
    expect(trendLabel(1.27)).toBe('none');
    expect(trendLabel(0)).toBe('none');
  });
});

describe('analyzeTrend', () => {
  it('refuses to conclude from fewer than 6 points', () => {
    expect(MIN_TREND_POINTS).toBe(6);
    expect(analyzeTrend(series([1, 2, 3, 4, 5]))).toEqual({
      n: 5,
      label: 'insufficient',
      direction: null,
      slope: null,
      z: null,
    });
  });

  it('reports a clear upward trend with its slope and direction', () => {
    const r = analyzeTrend(series([1, 2, 3, 4, 5, 6]));
    expect(r.label).toBe('clear');
    expect(r.direction).toBe('up');
    expect(r.slope).toBeCloseTo(1, 12);
    expect(r.z).toBeCloseTo(2.6304, 3);
    expect(r.n).toBe(6);
  });

  it('reports a clear downward trend', () => {
    const r = analyzeTrend(series([9, 8, 7, 6, 5, 4, 3]));
    expect(r.label).toBe('clear');
    expect(r.direction).toBe('down');
  });

  it('reports no trend and a flat direction for a constant series', () => {
    const r = analyzeTrend(series([5, 5, 5, 5, 5, 5]));
    expect(r).toMatchObject({ label: 'none', direction: 'flat', slope: 0, z: 0 });
  });

  it('is not fooled by noise around a constant level', () => {
    expect(analyzeTrend(series([5, 6, 4, 5, 6, 4, 5, 6])).label).toBe('none');
  });

  it('reports flat when every pair shares the same t (no slope can be computed)', () => {
    const same = [1, 2, 3, 4, 5, 6].map((x) => ({ t: 7, x }));
    expect(analyzeTrend(same)).toMatchObject({ direction: 'flat', slope: null });
  });

  it('rejects non-finite values', () => {
    expect(() => analyzeTrend(series([1, 2, 3, 4, 5, Number.NaN]))).toThrow(RangeError);
  });
});
