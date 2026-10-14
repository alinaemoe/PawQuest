import { describe, expect, it } from 'vitest';

import { MIN_N, OK_N, reliability } from './reliability';

describe('reliability (A-00)', () => {
  it('uses the spec thresholds', () => {
    expect(MIN_N).toBe(5);
    expect(OK_N).toBe(10);
  });

  it.each([
    [0, 'insufficient'],
    [4, 'insufficient'],
    [4.5, 'insufficient'],
    [5, 'preliminary'],
    [9, 'preliminary'],
    [10, 'ok'],
    [1000, 'ok'],
  ])('labels n=%s as %s', (n, label) => {
    expect(reliability(n)).toBe(label);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects n=%s with a RangeError', (n) => {
    expect(() => reliability(n)).toThrow(RangeError);
  });
});
