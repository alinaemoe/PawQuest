import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { median } from './median';

describe('median', () => {
  it('returns the middle value for an odd count and the mean of the middle two for an even count', () => {
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('does not modify its input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it('rejects an empty list', () => {
    expect(() => median([])).toThrow(RangeError);
  });

  it('property: lies between the minimum and the maximum', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1 }),
        (xs) => {
          const m = median(xs);
          expect(m).toBeGreaterThanOrEqual(Math.min(...xs));
          expect(m).toBeLessThanOrEqual(Math.max(...xs));
        },
      ),
    );
  });
});
