import { describe, expect, it } from 'vitest';

import { mulberry32 } from './random';

describe('mulberry32', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  it('stays in [0, 1) and is roughly uniform', () => {
    const next = mulberry32(2026);
    const buckets = new Array<number>(10).fill(0);
    const total = 100_000;
    for (let i = 0; i < total; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const bucket = Math.floor(v * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count / total).toBeGreaterThan(0.09);
      expect(count / total).toBeLessThan(0.11);
    }
  });
});
