import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { pluralCategory } from './plural';

describe('pluralCategory (ru)', () => {
  const cases: readonly [number, string][] = [
    [0, 'many'],
    [1, 'one'],
    [2, 'few'],
    [3, 'few'],
    [4, 'few'],
    [5, 'many'],
    [9, 'many'],
    [10, 'many'],
    [11, 'many'],
    [12, 'many'],
    [13, 'many'],
    [14, 'many'],
    [15, 'many'],
    [20, 'many'],
    [21, 'one'],
    [22, 'few'],
    [25, 'many'],
    [100, 'many'],
    [101, 'one'],
    [102, 'few'],
    [111, 'many'],
    [112, 'many'],
    [114, 'many'],
    [121, 'one'],
    [1001, 'one'],
    [-1, 'one'],
    [-2, 'few'],
  ];
  it.each(cases)('%d -> %s', (n, expected) => {
    expect(pluralCategory('ru', n)).toBe(expected);
  });

  it('non-integers are always other', () => {
    expect(pluralCategory('ru', 1.5)).toBe('other');
    expect(pluralCategory('ru', 0.2)).toBe('other');
  });
});

describe('pluralCategory (en)', () => {
  it('only 1 is one', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', -1)).toBe('one');
    for (const n of [0, 2, 5, 11, 21, 101]) {
      expect(pluralCategory('en', n)).toBe('other');
    }
    expect(pluralCategory('en', 1.5)).toBe('other');
  });
});

describe('pluralCategory properties', () => {
  it('ru categories repeat with period 100 for integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (n) => {
        expect(pluralCategory('ru', n)).toBe(pluralCategory('ru', n + 100));
      }),
    );
  });
  it('en never yields few or many', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (n) => {
        expect(['one', 'other']).toContain(pluralCategory('en', n));
      }),
    );
  });
});
