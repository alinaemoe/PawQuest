import { describe, expect, it } from 'vitest';

import { mulberry32 } from './random';
import {
  MIN_SIMILAR,
  SIMILAR_WALK_LEVELS,
  SIMILAR_WEATHER_LEVELS,
  compareToUsual,
  similarWalks,
  usualStats,
  type SimilarWalk,
} from './similar';

let id = 0;
const walk = (dims: Record<string, string | undefined>, startedAt = 0): SimilarWalk => ({
  id: `w${String(id++)}`,
  startedAt,
  dims,
});
const many = (count: number, dims: Record<string, string | undefined>, from = 0): SimilarWalk[] =>
  Array.from({ length: count }, (_, i) => walk(dims, from + i));

describe('similarWalks', () => {
  const park = { place_kind: 'green', walk_type: 'base_to_base' };

  it('the narrowest circle with enough walks: the same kind of place and the same kind of walk', () => {
    const target = walk(park, 100);
    const all = [
      target,
      ...many(6, park),
      ...many(4, { place_kind: 'green', walk_type: 'other' }),
      ...many(4, { place_kind: 'streets', walk_type: 'base_to_base' }),
    ];
    const result = similarWalks(all, target);
    expect(result?.walks).toHaveLength(6);
    expect(result).toMatchObject({ level: 0, widened: false, keys: ['place_kind', 'walk_type'] });
    expect(result?.walks.map((w) => w.id)).not.toContain(target.id);
  });

  it('too few of those: the next circle, and it says it was widened', () => {
    const target = walk(park);
    const all = [
      target,
      ...many(3, park),
      ...many(4, { place_kind: 'green', walk_type: 'other' }),
      ...many(5, { place_kind: 'streets', walk_type: 'base_to_base' }),
    ];
    const result = similarWalks(all, target);
    expect(result).toMatchObject({ level: 1, widened: true, keys: ['place_kind'] });
    expect(result?.walks).toHaveLength(7); // 3 + 4 green walks
  });

  it('down to the same kind of walk, and to any walk', () => {
    const target = walk(park);
    const byType = [
      target,
      ...many(2, park),
      ...many(5, { place_kind: 'streets', walk_type: 'base_to_base' }),
    ];
    expect(similarWalks(byType, target)).toMatchObject({ level: 2, keys: ['walk_type'] });
    const any = [
      target,
      ...many(2, park),
      ...many(5, { place_kind: 'streets', walk_type: 'other' }),
    ];
    expect(similarWalks(any, target)).toMatchObject({ level: 3, keys: [], widened: true });
  });

  it('five is enough, four is not', () => {
    const target = walk(park);
    expect(similarWalks([target, ...many(MIN_SIMILAR, park)], target)?.walks).toHaveLength(5);
    expect(similarWalks([target, ...many(MIN_SIMILAR - 1, park)], target)).toBeNull();
  });

  it('a target without the dimensions starts at the circle it can be described by, not "widened"', () => {
    const noPlace = walk({ walk_type: 'base_to_base' });
    const all = [noPlace, ...many(6, { place_kind: 'green', walk_type: 'base_to_base' })];
    expect(similarWalks(all, noPlace)).toMatchObject({
      level: 2,
      keys: ['walk_type'],
      widened: false,
    });
    const bare = walk({});
    expect(similarWalks([bare, ...many(6, park)], bare)).toMatchObject({
      level: 3,
      keys: [],
      widened: false,
    });
  });

  it('newest first, and the target is never among them', () => {
    const target = walk(park, 50);
    const all = [...many(6, park, 10), target];
    const ids = similarWalks(all, target)?.walks.map((w) => w.startedAt);
    expect(ids).toEqual([15, 14, 13, 12, 11, 10]);
  });

  it('weather circles work the same way, for conditions that are not a walk yet', () => {
    const today = {
      id: 'today',
      startedAt: 0,
      dims: { ground: 'wet', temp: '0_10', light: 'day' },
    };
    const all = [
      ...many(2, { ground: 'wet', temp: '0_10', light: 'day' }),
      ...many(4, { ground: 'wet', temp: '0_10', light: 'dark' }),
      ...many(9, { ground: 'wet', temp: '10_20', light: 'day' }),
    ];
    expect(similarWalks(all, today, SIMILAR_WEATHER_LEVELS)).toMatchObject({
      level: 1,
      keys: ['ground', 'temp'],
      widened: true,
    });
    expect(similarWalks([], today, SIMILAR_WEATHER_LEVELS)).toBeNull();
  });

  it('nobody to compare with gives nothing', () => {
    const target = walk(park);
    expect(similarWalks([target], target)).toBeNull();
    expect(similarWalks([], target)).toBeNull();
  });
});

describe('similarWalks (random walks, the rules always hold)', () => {
  it('every walk returned shares the level keys, the circle is the narrowest that has enough, order does not matter', () => {
    const rand = mulberry32(21);
    const pick = (values: readonly string[]) => values[Math.floor(rand() * values.length)];
    for (let round = 0; round < 200; round += 1) {
      const all: SimilarWalk[] = Array.from({ length: 5 + Math.floor(rand() * 40) }, (_, i) => ({
        id: `r${String(round)}-${String(i)}`,
        startedAt: Math.floor(rand() * 1000),
        dims: {
          place_kind: pick(['green', 'streets', 'water']),
          walk_type: pick(['base_to_base', 'other']),
        },
      }));
      const target = all[Math.floor(rand() * all.length)] ?? walk({});
      const result = similarWalks(all, target);
      const shuffled = [...all].sort(() => rand() - 0.5);
      expect(similarWalks(shuffled, target)).toEqual(result);
      if (result === null) {
        // no circle has enough walks
        for (const keys of SIMILAR_WALK_LEVELS) {
          const n = all.filter(
            (w) => w.id !== target.id && keys.every((k) => w_dim(w, k) === w_dim(target, k)),
          ).length;
          expect(n).toBeLessThan(MIN_SIMILAR);
        }
        continue;
      }
      expect(result.walks.length).toBeGreaterThanOrEqual(MIN_SIMILAR);
      expect(result.walks.every((w) => w.id !== target.id)).toBe(true);
      for (const w of result.walks) {
        expect(result.keys.every((k) => w_dim(w, k) === w_dim(target, k))).toBe(true);
      }
      // every narrower circle had too few
      for (let i = 0; i < result.level; i += 1) {
        const keys = SIMILAR_WALK_LEVELS[i] ?? [];
        const n = all.filter(
          (w) => w.id !== target.id && keys.every((k) => w_dim(w, k) === w_dim(target, k)),
        ).length;
        expect(n).toBeLessThan(MIN_SIMILAR);
      }
    }
  });
});

function w_dim(w: SimilarWalk, key: string): string | undefined {
  return w.dims[key];
}

describe('usualStats', () => {
  it('median, the middle half and the extremes', () => {
    expect(usualStats([10, 20, 30, 40, 50])).toEqual({
      n: 5,
      median: 30,
      q1: 20,
      q3: 40,
      min: 10,
      max: 50,
    });
    expect(usualStats([5, 1, 3])).toMatchObject({ median: 3, min: 1, max: 5 });
    expect(usualStats([1, 2, 3, 4])).toMatchObject({ median: 2.5, q1: 1.75, q3: 3.25 });
  });

  it('one value is its own usual, nothing is nothing, bad numbers are left out', () => {
    expect(usualStats([7])).toEqual({ n: 1, median: 7, q1: 7, q3: 7, min: 7, max: 7 });
    expect(usualStats([])).toBeNull();
    expect(usualStats([Number.NaN, Infinity])).toBeNull();
    expect(usualStats([1, Number.NaN, 3])).toMatchObject({ n: 2, median: 2 });
  });
});

describe('compareToUsual', () => {
  const usual = { median: 30 * 60 };
  const rule = { floor: 120 };

  it('usual within the larger of the floor and a tenth, longer or shorter beyond', () => {
    expect(compareToUsual(33 * 60, usual, rule)).toEqual({ kind: 'usual', diff: 0 }); // a tenth is 3 min
    expect(compareToUsual(33 * 60 + 1, usual, rule)).toEqual({ kind: 'longer', diff: 181 });
    expect(compareToUsual(20 * 60, usual, rule)).toEqual({ kind: 'shorter', diff: 600 });
  });

  it('a small usual is held by the floor', () => {
    expect(compareToUsual(5 * 60, { median: 3 * 60 }, rule)).toEqual({ kind: 'usual', diff: 0 });
    expect(compareToUsual(6 * 60, { median: 3 * 60 }, rule).kind).toBe('longer');
  });

  it('the share can be changed', () => {
    expect(compareToUsual(36 * 60, usual, { floor: 0, share: 0.25 }).kind).toBe('usual');
    expect(compareToUsual(40 * 60, usual, { floor: 0, share: 0.25 }).kind).toBe('longer');
  });
});
