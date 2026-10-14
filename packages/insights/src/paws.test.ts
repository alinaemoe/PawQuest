import { describe, expect, it } from 'vitest';

import { DAILY_PAW_CAP, PAW_LEVELS, attemptPaws, eventPaws, grantPaws, pawLevel } from './paws';

describe('grantPaws', () => {
  it('uses the spec cap of 100 per day', () => {
    expect(DAILY_PAW_CAP).toBe(100);
  });

  it('grants the full amount below the cap and only the remainder at the cap', () => {
    expect(grantPaws(10, 0)).toBe(10);
    expect(grantPaws(10, 85)).toBe(10);
    expect(grantPaws(10, 95)).toBe(5);
    expect(grantPaws(10, 100)).toBe(0);
    expect(grantPaws(10, 140)).toBe(0); // never negative, even if the day is over the cap
  });

  it('accepts a custom cap and rejects invalid numbers', () => {
    expect(grantPaws(10, 0, 4)).toBe(4);
    expect(() => grantPaws(-1, 0)).toThrow(RangeError);
    expect(() => grantPaws(1, Number.NaN)).toThrow(RangeError);
    expect(() => grantPaws(1, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('eventPaws and attemptPaws', () => {
  it('gives 1 paw per event, at most 20 per walk', () => {
    expect(eventPaws(0)).toBe(0);
    expect(eventPaws(7)).toBe(7);
    expect(eventPaws(20)).toBe(20);
    expect(eventPaws(35)).toBe(20);
  });

  it('gives 1 paw per two attempts, at most 10 per session', () => {
    expect(attemptPaws(0)).toBe(0);
    expect(attemptPaws(1)).toBe(0);
    expect(attemptPaws(7)).toBe(3);
    expect(attemptPaws(20)).toBe(10);
    expect(attemptPaws(500)).toBe(10);
  });

  it('rejects negative or fractional counts', () => {
    expect(() => eventPaws(-1)).toThrow(RangeError);
    expect(() => eventPaws(1.5)).toThrow(RangeError);
    expect(() => attemptPaws(-2)).toThrow(RangeError);
    expect(() => attemptPaws(2.5)).toThrow(RangeError);
  });
});

describe('pawLevel', () => {
  it('uses the spec thresholds', () => {
    expect(PAW_LEVELS.map((l) => l.from)).toEqual([0, 200, 600, 1500, 3500, 7500]);
  });

  it.each([
    [0, 0, 'puppy_step'],
    [199, 0, 'puppy_step'],
    [200, 1, 'tracker'],
    [599, 1, 'tracker'],
    [600, 2, 'observer'],
    [1500, 3, 'companion'],
    [3500, 4, 'expert'],
    [7500, 5, 'trail_veteran'],
    [99999, 5, 'trail_veteran'],
  ])('maps %s paws to level %s (%s)', (total, index, key) => {
    expect(pawLevel(total)).toMatchObject({ index, key });
  });

  it('reports progress to the next level (the prototype: 340 of 600 is level 1, 35 %)', () => {
    const level = pawLevel(340);
    expect(level.nextAt).toBe(600);
    expect(level.progress).toBeCloseTo((340 - 200) / 400, 12);
  });

  it('has no next level at the top', () => {
    expect(pawLevel(9000)).toMatchObject({ nextAt: null, progress: 1 });
  });

  it('rejects invalid totals', () => {
    expect(() => pawLevel(-1)).toThrow(RangeError);
    expect(() => pawLevel(Number.NaN)).toThrow(RangeError);
  });
});
