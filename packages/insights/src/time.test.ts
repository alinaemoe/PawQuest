import { describe, expect, it } from 'vitest';

import { assertFinite, localDay } from './time';

describe('localDay', () => {
  it('is 0 at the epoch and moves with the offset', () => {
    expect(localDay(0, 0)).toBe(0);
    expect(localDay(0, 180)).toBe(0);
    expect(localDay(21 * 3_600_000, 180)).toBe(1); // 21:00 UTC is already the next day at +03:00
    expect(localDay(0, -60)).toBe(-1); // 23:00 the day before at -01:00
  });

  it('floors, including for times before 1970', () => {
    expect(localDay(-1, 0)).toBe(-1);
    expect(localDay(86_400_000 - 1, 0)).toBe(0);
    expect(localDay(86_400_000, 0)).toBe(1);
  });
});

describe('assertFinite', () => {
  it('accepts finite numbers and rejects NaN and infinities', () => {
    expect(() => {
      assertFinite('x', 1, 2, 3);
    }).not.toThrow();
    expect(() => {
      assertFinite('x', 1, Number.NaN);
    }).toThrow(RangeError);
    expect(() => {
      assertFinite('x', Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
  });
});
