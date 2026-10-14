import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { median } from '@pawquest/core';

import { compareMedians, compareProportions, differenceLabel } from './compare';

describe('differenceLabel (A-07, D-49)', () => {
  it('is insufficient whenever the smaller group has fewer than 5 observations', () => {
    expect(differenceLabel(0.001, 4, 100)).toBe('insufficient');
    expect(differenceLabel(0.001, 100, 4)).toBe('insufficient');
    expect(differenceLabel(0.9, 3, 3)).toBe('insufficient');
  });

  it('maps p to noticeable / possible / unclear with the spec boundaries', () => {
    expect(differenceLabel(0.0499, 5, 5)).toBe('noticeable');
    expect(differenceLabel(0.05, 5, 5)).toBe('possible');
    expect(differenceLabel(0.1999, 5, 5)).toBe('possible');
    expect(differenceLabel(0.2, 5, 5)).toBe('unclear');
    expect(differenceLabel(1, 50, 50)).toBe('unclear');
  });
});

/** Brute force: enumerate every way to choose which pooled items belong to group A. */
function bruteForceP(a: readonly number[], b: readonly number[]): number {
  const pool = [...a, ...b];
  const observed = Math.abs(
    a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length,
  );
  let extreme = 0;
  let all = 0;
  const choose = (start: number, picked: number[]): void => {
    if (picked.length === a.length) {
      const inA = new Set(picked);
      let sumA = 0;
      let sumB = 0;
      pool.forEach((v, i) => {
        if (inA.has(i)) {
          sumA += v;
        } else {
          sumB += v;
        }
      });
      const d = Math.abs(sumA / a.length - sumB / b.length);
      all += 1;
      if (d >= observed - 1e-9) {
        extreme += 1;
      }
      return;
    }
    for (let i = start; i < pool.length; i++) {
      choose(i + 1, [...picked, i]);
    }
  };
  choose(0, []);
  return extreme / all;
}

function binary(successes: number, n: number): number[] {
  return [...new Array<number>(successes).fill(1), ...new Array<number>(n - successes).fill(0)];
}

describe('compareProportions', () => {
  it('matches the exact two-sided Fisher value for 8/10 against 2/10 (0.02301, checked by hand)', () => {
    const r = compareProportions({ successes: 8, n: 10 }, { successes: 2, n: 10 });
    expect(r?.p).toBeCloseTo(0.02301, 4);
    expect(r?.delta).toBeCloseTo(0.6, 12);
    expect(r?.label).toBe('noticeable');
  });

  it('gives p = 1 for identical shares and is symmetric in the group order', () => {
    expect(compareProportions({ successes: 3, n: 10 }, { successes: 3, n: 10 })?.p).toBeCloseTo(
      1,
      9,
    );
    const ab = compareProportions({ successes: 7, n: 8 }, { successes: 2, n: 5 });
    const ba = compareProportions({ successes: 2, n: 5 }, { successes: 7, n: 8 });
    expect(ab?.p).toBeCloseTo(ba?.p ?? Number.NaN, 12);
    expect(ab?.delta).toBeCloseTo(-(ba?.delta ?? Number.NaN), 12);
  });

  it('labels the prototype example (7 of 8 vs 2 of 6, exact p = 0.0909) as possible', () => {
    const r = compareProportions({ successes: 7, n: 8 }, { successes: 2, n: 6 });
    expect(r?.p).toBeCloseTo(0.0909, 3);
    expect(r?.label).toBe('possible');
  });

  it('labels 7 of 8 vs 2 of 5 (exact p = 0.2168, checked by full enumeration) as unclear', () => {
    const r = compareProportions({ successes: 7, n: 8 }, { successes: 2, n: 5 });
    expect(r?.p).toBeCloseTo(0.2168, 3);
    expect(r?.label).toBe('unclear');
  });

  it('reports insufficient data for a group below 5 observations', () => {
    const r = compareProportions({ successes: 4, n: 4 }, { successes: 0, n: 10 });
    expect(r?.label).toBe('insufficient');
  });

  it('returns null when a group is empty', () => {
    expect(compareProportions({ successes: 0, n: 0 }, { successes: 1, n: 3 })).toBeNull();
    expect(compareProportions({ successes: 1, n: 3 }, { successes: 0, n: 0 })).toBeNull();
  });

  it.each([
    [{ successes: -1, n: 5 }],
    [{ successes: 6, n: 5 }],
    [{ successes: 1.5, n: 5 }],
    [{ successes: 1, n: 5.5 }],
    [{ successes: Number.NaN, n: 5 }],
  ])('rejects the invalid group %j with a RangeError', (bad) => {
    expect(() => compareProportions(bad, { successes: 1, n: 5 })).toThrow(RangeError);
    expect(() => compareProportions({ successes: 1, n: 5 }, bad)).toThrow(RangeError);
  });

  it('property: equals the brute-force enumeration of all permutations for small groups', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.nat(6),
        fc.nat(6),
        (nA, nB, kA0, kB0) => {
          const kA = Math.min(kA0, nA);
          const kB = Math.min(kB0, nB);
          const exact = compareProportions({ successes: kA, n: nA }, { successes: kB, n: nB });
          expect(exact?.p).toBeCloseTo(bruteForceP(binary(kA, nA), binary(kB, nB)), 9);
        },
      ),
    );
  });
});

describe('compareMedians', () => {
  const low = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const high = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('finds clearly separated samples noticeable and reports the median difference', () => {
    const r = compareMedians(low, high);
    expect(r?.delta).toBe(median(low) - median(high));
    expect(r?.p).toBeLessThan(0.01);
    expect(r?.label).toBe('noticeable');
  });

  it('finds the same sample against itself unclear (p close to 1)', () => {
    const r = compareMedians(low, [...low]);
    expect(r?.p).toBeGreaterThan(0.9);
    expect(r?.label).toBe('unclear');
  });

  it('is reproducible for a fixed seed, and the seed can be changed', () => {
    const mixed = [3, 9, 4, 12, 7, 15, 6];
    const other = [5, 8, 11, 13, 2, 10, 14];
    expect(compareMedians(mixed, other)).toEqual(compareMedians(mixed, other));
    const seeded = compareMedians(mixed, other, { seed: 1 });
    expect(seeded?.p).toBeGreaterThan(0);
    expect(seeded?.p).toBeLessThanOrEqual(1);
  });

  it('never returns p = 0 (the +1 correction) and respects the number of permutations', () => {
    const r = compareMedians(low, high, { permutations: 200 });
    expect(r?.p).toBeGreaterThanOrEqual(1 / 201);
  });

  it('is close to the exact answer for a small sample (Monte Carlo error below 0.04)', () => {
    const a = [2, 4, 5, 9];
    const b = [3, 6, 7, 11];
    const mc = compareMedians(a, b, { permutations: 5000 });
    // For samples of 4 the medians are means of the middle pair; enumerate the exact distribution.
    const pool = [...a, ...b];
    let extreme = 0;
    let all = 0;
    const observed = Math.abs(median(a) - median(b));
    const choose = (start: number, picked: number[]): void => {
      if (picked.length === a.length) {
        const inA = new Set(picked);
        const ga = pool.filter((_, i) => inA.has(i));
        const gb = pool.filter((_, i) => !inA.has(i));
        all += 1;
        if (Math.abs(median(ga) - median(gb)) >= observed - 1e-12) {
          extreme += 1;
        }
        return;
      }
      for (let i = start; i < pool.length; i++) {
        choose(i + 1, [...picked, i]);
      }
    };
    choose(0, []);
    expect(Math.abs((mc?.p ?? Number.NaN) - extreme / all)).toBeLessThan(0.04);
  });

  it('returns null for an empty sample and rejects invalid input', () => {
    expect(compareMedians([], [1, 2])).toBeNull();
    expect(compareMedians([1, 2], [])).toBeNull();
    expect(() => compareMedians([1, Number.NaN], [2])).toThrow(RangeError);
    expect(() => compareMedians([1], [2], { permutations: 0 })).toThrow(RangeError);
    expect(() => compareMedians([1], [2], { permutations: 2.5 })).toThrow(RangeError);
  });

  it('labels small samples insufficient regardless of the difference', () => {
    expect(compareMedians([1, 2, 3], [100, 101, 102])?.label).toBe('insufficient');
  });
});
