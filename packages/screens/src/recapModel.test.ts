import { describe, expect, it } from 'vitest';

import { recapDelta } from './recapModel';

describe('recapDelta', () => {
  it('has nothing to compare with when the week before had no walks', () => {
    expect(recapDelta(5000, 0, 0)).toEqual({ kind: 'none', distanceM: 0 });
  });

  it('says more or less with the size of the difference', () => {
    expect(recapDelta(9000, 6000, 3)).toEqual({ kind: 'more', distanceM: 3000 });
    expect(recapDelta(2000, 6000, 3)).toEqual({ kind: 'less', distanceM: 4000 });
  });

  it('small differences are the same: under 200 m or under 5 %', () => {
    expect(recapDelta(1100, 1000, 1).kind).toBe('same');
    expect(recapDelta(1199, 1000, 1).kind).toBe('same');
    expect(recapDelta(1200, 1000, 1).kind).toBe('more');
    expect(recapDelta(20_900, 20_000, 5).kind).toBe('same'); // 900 < 5 % of 20 km = 1000
    expect(recapDelta(21_100, 20_000, 5).kind).toBe('more');
  });

  it('a previous week with walks but no distance (manual walks) still compares', () => {
    expect(recapDelta(0, 0, 2).kind).toBe('same');
    expect(recapDelta(3000, 0, 2)).toEqual({ kind: 'more', distanceM: 3000 });
  });
});
