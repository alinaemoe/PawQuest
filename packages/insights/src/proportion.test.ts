import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { countSuccesses, wilsonInterval } from './proportion';

describe('wilsonInterval (A-06)', () => {
  it('returns null when there is no data', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  // Reference values of the standard Wilson score interval, z = 1.96.
  it.each([
    [7, 10, 0.3968, 0.8922],
    [3, 7, 0.1582, 0.7495],
    [0, 10, 0, 0.2775],
    [10, 10, 0.7225, 1],
    [50, 100, 0.4038, 0.5962],
  ])('matches the published interval for %s of %s', (k, n, low, high) => {
    const r = wilsonInterval(k, n);
    expect(r?.p).toBeCloseTo(k / n, 12);
    expect(r?.low).toBeCloseTo(low, 3);
    expect(r?.high).toBeCloseTo(high, 3);
  });

  it('supports fractional successes (partial attempts)', () => {
    const r = wilsonInterval(5, 7);
    expect(r?.p).toBeCloseTo(5 / 7, 12);
    const half = wilsonInterval(4.5, 7);
    expect(half?.p).toBeCloseTo(4.5 / 7, 12);
  });

  it.each([
    [-1, 5],
    [6, 5],
    [Number.NaN, 5],
    [1, Number.NaN],
    [1, -2],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ])('rejects invalid arguments (successes=%s, n=%s) with a RangeError', (k, n) => {
    expect(() => wilsonInterval(k, n)).toThrow(RangeError);
  });

  it('property: low <= p <= high within [0, 1], and the interval narrows as n grows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (n, share) => {
          const k = Math.round(share * n);
          const r = wilsonInterval(k, n);
          expect(r).not.toBeNull();
          if (r !== null) {
            expect(r.low).toBeGreaterThanOrEqual(0);
            expect(r.high).toBeLessThanOrEqual(1);
            expect(r.low).toBeLessThanOrEqual(r.p + 1e-12);
            expect(r.p).toBeLessThanOrEqual(r.high + 1e-12);
            const bigger = wilsonInterval(k * 4, n * 4);
            if (bigger !== null) {
              expect(bigger.high - bigger.low).toBeLessThan(r.high - r.low);
            }
          }
        },
      ),
    );
  });
});

describe('countSuccesses', () => {
  const results = ['successful', 'partial', 'unsuccessful', 'partial', 'successful'] as const;

  it('counts a partial attempt as half a success by default', () => {
    expect(countSuccesses(results)).toBe(3);
  });

  it('can count partial attempts as successes or as failures', () => {
    expect(countSuccesses(results, 'success')).toBe(4);
    expect(countSuccesses(results, 'failure')).toBe(2);
  });

  it('is 0 for no attempts', () => {
    expect(countSuccesses([])).toBe(0);
  });
});
