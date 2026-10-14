import { describe, expect, it } from 'vitest';

import {
  benjaminiHochberg,
  coOccurrences,
  patternCards,
  patternKey,
  type AnalysisUnit,
} from './patterns';

/** `counts` is a list of [dimension values, how many units, how many of them had the outcome]. */
function build(
  groups: readonly { dims: Record<string, string>; n: number; hit: number; outcome?: string }[],
): AnalysisUnit[] {
  const units: AnalysisUnit[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      units.push({
        id: `${JSON.stringify(g.dims)}-${String(i)}`,
        dims: g.dims,
        outcomes: { [g.outcome ?? 'hard']: i < g.hit },
      });
    }
  }
  return units;
}

describe('benjaminiHochberg', () => {
  it('rejects everything when the largest p is exactly on its line (hand-checked)', () => {
    // m = 4, q = 0.2: lines 0.05, 0.10, 0.15, 0.20 for sorted p = 0.01, 0.03, 0.04, 0.20
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.2], 0.2)).toEqual([true, true, true, true]);
  });

  it('keeps the largest p out when q is tighter (hand-checked)', () => {
    // m = 4, q = 0.1: lines 0.025, 0.05, 0.075, 0.1 -> the first three pass, 0.2 does not
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.2], 0.1)).toEqual([true, true, true, false]);
  });

  it('is a step-up procedure: a later passing rank rescues an earlier miss', () => {
    // m = 3, q = 0.05: lines 0.0167, 0.0333, 0.05. p = 0.02 is above its line (0.0167), but
    // the third p = 0.03 is below 0.05, so all three are rejected.
    expect(benjaminiHochberg([0.02, 0.026, 0.03], 0.05)).toEqual([true, true, true]);
  });

  it('rejects only the smallest when the others miss their lines', () => {
    expect(benjaminiHochberg([0.04, 0.001, 0.5], 0.05)).toEqual([false, true, false]);
  });

  it('handles no hypotheses and ties', () => {
    expect(benjaminiHochberg([], 0.2)).toEqual([]);
    expect(benjaminiHochberg([0.01, 0.01], 0.05)).toEqual([true, true]);
  });

  it('rejects invalid arguments', () => {
    expect(() => benjaminiHochberg([0.5], 0)).toThrow(RangeError);
    expect(() => benjaminiHochberg([0.5], 1.5)).toThrow(RangeError);
    expect(() => benjaminiHochberg([1.2], 0.2)).toThrow(RangeError);
    expect(() => benjaminiHochberg([Number.NaN], 0.2)).toThrow(RangeError);
  });
});

describe('coOccurrences (A-13)', () => {
  it('reproduces the spec example: 5 of 9 against 6 of 24, lift 1.667', () => {
    const units = build([
      { dims: { tod: 'evening' }, n: 9, hit: 5 },
      { dims: { tod: 'morning' }, n: 24, hit: 6 },
    ]);
    const [c] = coOccurrences(units, 'hard', ['tod']);
    expect(c?.value).toBe('evening');
    expect(c?.direction).toBe('more');
    expect(c?.support).toBe(5);
    expect(c?.lift).toBeCloseTo(5 / 9 / (11 / 33), 12);
    expect(c?.inCondition).toMatchObject({ k: 5, n: 9 });
    expect(c?.rest).toMatchObject({ k: 6, n: 24 });
    expect(c?.inCondition.interval?.low).toBeGreaterThan(0);
  });

  it('also reports "less often" conditions (lift at most 2/3)', () => {
    const units = build([
      { dims: { place: 'park' }, n: 10, hit: 1 },
      { dims: { place: 'street' }, n: 20, hit: 12 },
    ]);
    const found = coOccurrences(units, 'hard', ['place']);
    const park = found.find((c) => c.value === 'park');
    expect(park?.direction).toBe('less');
    expect(park?.lift).toBeLessThan(2 / 3);
  });

  it('needs support of 5, a group of 8 and a lift of 1.5', () => {
    const weakSupport = build([
      { dims: { tod: 'evening' }, n: 9, hit: 4 }, // support 4
      { dims: { tod: 'morning' }, n: 24, hit: 1 },
    ]);
    // "evening" is cut by its support of 4; "morning" (1 of 24) is a valid "less often" finding.
    expect(coOccurrences(weakSupport, 'hard', ['tod']).map((c) => c.value)).toEqual(['morning']);
    const smallGroup = build([
      { dims: { tod: 'evening' }, n: 7, hit: 6 }, // group of 7
      { dims: { tod: 'morning' }, n: 24, hit: 1 },
    ]);
    expect(coOccurrences(smallGroup, 'hard', ['tod']).map((c) => c.value)).toEqual(['morning']);
    const weakLift = build([
      { dims: { tod: 'evening' }, n: 20, hit: 8 },
      { dims: { tod: 'morning' }, n: 20, hit: 7 }, // lift 8/20 / (15/40) = 1.07
    ]);
    expect(coOccurrences(weakLift, 'hard', ['tod'])).toEqual([]);
  });

  it('skips a condition when the outcome never happened (lift undefined)', () => {
    const none = build([
      { dims: { tod: 'evening' }, n: 10, hit: 0 },
      { dims: { tod: 'morning' }, n: 10, hit: 0 },
    ]);
    expect(coOccurrences(none, 'hard', ['tod'])).toEqual([]);
  });

  it('ignores units without the dimension or the outcome and sorts by strength', () => {
    const units = [
      ...build([
        { dims: { tod: 'evening' }, n: 10, hit: 8 },
        { dims: { tod: 'morning' }, n: 20, hit: 4 },
        { dims: { wet: 'rain' }, n: 10, hit: 6 },
        { dims: { wet: 'dry' }, n: 20, hit: 5 },
      ]),
      { id: 'no-outcome', dims: { tod: 'evening' }, outcomes: {} },
    ];
    const found = coOccurrences(units, 'hard', ['tod', 'wet']);
    // evening (lift 2.0), morning (lift 0.5, "less") and rain (lift 1.64); dry (0.68) is above 2/3.
    expect(found.map((c) => `${c.dimension}:${c.value}`)).toEqual([
      'tod:evening',
      'tod:morning',
      'wet:rain',
    ]);
    for (let i = 1; i < found.length; i++) {
      const prev = found[i - 1];
      const cur = found[i];
      expect(Math.abs(Math.log(prev?.lift ?? 1))).toBeGreaterThanOrEqual(
        Math.abs(Math.log(cur?.lift ?? 1)),
      );
    }
    expect(found[0]?.inCondition.n).toBe(10); // the unit without an outcome was not counted
  });
});

describe('patternCards (A-14)', () => {
  const strong = build([
    { dims: { tod: 'evening', wet: 'dry' }, n: 20, hit: 12 },
    { dims: { tod: 'morning', wet: 'rain' }, n: 20, hit: 3 },
    { dims: { tod: 'evening', wet: 'rain' }, n: 20, hit: 9 },
    { dims: { tod: 'morning', wet: 'dry' }, n: 20, hit: 6 },
  ]);

  it('finds the strong pattern and reports how many comparisons were checked', () => {
    const cards = patternCards(strong, ['tod'], ['hard']);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card?.key).toBe(patternKey('tod', 'evening', 'hard'));
    expect(card?.delta).toBeCloseTo(21 / 40 - 9 / 40, 12);
    expect(card?.label).toBe('noticeable');
    expect(card?.reliability).toBe('ok');
    expect(card?.testedCount).toBe(2); // evening vs rest, morning vs rest
  });

  it('keeps one card per dimension, the strongest', () => {
    const cards = patternCards(strong, ['tod', 'wet'], ['hard']);
    const dims = cards.map((c) => c.dimension);
    expect(new Set(dims).size).toBe(dims.length);
  });

  it('drops candidates with fewer than 5 units in a group', () => {
    const tiny = build([
      { dims: { tod: 'evening' }, n: 4, hit: 4 },
      { dims: { tod: 'morning' }, n: 30, hit: 0 },
    ]);
    expect(patternCards(tiny, ['tod'], ['hard'])).toEqual([]);
  });

  it('shows nothing for pure noise', () => {
    const noise = build([
      { dims: { tod: 'evening' }, n: 20, hit: 10 },
      { dims: { tod: 'morning' }, n: 20, hit: 10 },
    ]);
    expect(patternCards(noise, ['tod'], ['hard'])).toEqual([]);
  });

  it('requires an effect of at least 20 percentage points', () => {
    const small = build([
      { dims: { tod: 'evening' }, n: 300, hit: 150 },
      { dims: { tod: 'morning' }, n: 300, hit: 120 }, // 50% vs 40%: significant but only 10 pp
    ]);
    expect(patternCards(small, ['tod'], ['hard'])).toEqual([]);
    expect(patternCards(small, ['tod'], ['hard'], { minAbsDelta: 0.05 })).toHaveLength(1);
  });

  it('honours excluded keys, the card limit and works over several outcomes', () => {
    const key = patternKey('tod', 'evening', 'hard');
    expect(
      patternCards(strong, ['tod'], ['hard'], { excludeKeys: new Set([key]) }).map((c) => c.key),
    ).not.toContain(key);
    const many = [
      ...build([
        { dims: { a: 'x', b: 'x', c: 'x' }, n: 20, hit: 18 },
        { dims: { a: 'y', b: 'y', c: 'y' }, n: 20, hit: 2 },
      ]),
    ];
    expect(patternCards(many, ['a', 'b', 'c'], ['hard'], { maxCards: 2 })).toHaveLength(2);
    expect(patternCards(many, ['a', 'b', 'c'], ['hard'])).toHaveLength(3);
  });

  it('returns nothing for no units', () => {
    expect(patternCards([], ['tod'], ['hard'])).toEqual([]);
  });

  it('ranks by effect size times the square root of the smaller group', () => {
    const units = [
      ...build([
        { dims: { big: 'a' }, n: 50, hit: 35 },
        { dims: { big: 'b' }, n: 50, hit: 15 }, // delta 0.4, n 50 -> 2.83
        { dims: { small: 'a' }, n: 8, hit: 8 },
        { dims: { small: 'b' }, n: 8, hit: 0 }, // delta 1.0, n 8 -> 2.83 too: tie broken by key
      ]),
    ];
    // Units of the two groups are disjoint (each only has one dimension), so both are tested.
    const cards = patternCards(units, ['big', 'small'], ['hard']);
    expect(cards.length).toBeGreaterThan(0);
    const scores = cards.map(
      (c) => Math.abs(c.delta) * Math.sqrt(Math.min(c.inCondition.n, c.rest.n)),
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
