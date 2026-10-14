import { median } from '@pawquest/core';

import { mulberry32 } from './random';
import { MIN_N } from './reliability';

/** What the user is told about a difference between two groups (spec A-07, decision D-49). */
export type DifferenceLabel = 'insufficient' | 'noticeable' | 'possible' | 'unclear';

export interface Comparison {
  /** Effect size: difference of shares (A minus B) or of medians (A minus B). */
  readonly delta: number;
  /** Two-sided permutation p-value. Internal: the UI shows only the label. */
  readonly p: number;
  readonly label: DifferenceLabel;
  readonly nA: number;
  readonly nB: number;
}

/** Counts of a binary outcome in one group. */
export interface BinaryGroup {
  readonly successes: number;
  readonly n: number;
}

/**
 * Maps a p-value and the group sizes to the label shown to the user.
 * Fewer than 5 observations in the smaller group is always `insufficient` (A-00).
 */
export function differenceLabel(p: number, nA: number, nB: number): DifferenceLabel {
  if (Math.min(nA, nB) < MIN_N) {
    return 'insufficient';
  }
  if (p < 0.05) {
    return 'noticeable';
  }
  return p < 0.2 ? 'possible' : 'unclear';
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0`);
  }
}

/** ln(n!) for 0..n, built by summation (exact enough for the group sizes of a dog diary). */
function logFactorials(n: number): number[] {
  const table = [0];
  for (let i = 1; i <= n; i++) {
    table.push((table[i - 1] ?? 0) + Math.log(i));
  }
  return table;
}

/**
 * Compares the share of successes in two groups with the exact permutation test.
 *
 * Shuffling the group labels of a binary outcome gives a hypergeometric distribution for the
 * number of successes in group A; summing it exactly is the limit of infinitely many random
 * permutations, deterministic and independent of any seed (decision D-49).
 *
 * Returns null when either group is empty.
 *
 * @throws RangeError if a count is not an integer >= 0 or successes exceed n.
 */
export function compareProportions(a: BinaryGroup, b: BinaryGroup): Comparison | null {
  for (const [group, name] of [
    [a, 'group A'],
    [b, 'group B'],
  ] as const) {
    assertCount(group.n, `${name} n`);
    assertCount(group.successes, `${name} successes`);
    if (group.successes > group.n) {
      throw new RangeError(`${name} successes must not exceed n`);
    }
  }
  if (a.n === 0 || b.n === 0) {
    return null;
  }

  const total = a.n + b.n;
  const successes = a.successes + b.successes;
  const delta = a.successes / a.n - b.successes / b.n;
  const lf = logFactorials(total);
  const lf0 = (i: number): number => lf[i] ?? 0;
  const logChoose = (n: number, k: number): number => lf0(n) - lf0(k) - lf0(n - k);
  // P(X = x) = C(nA, x) * C(nB, K - x) / C(N, K): choose which K of the N items are successes.
  const logDenominator = logChoose(total, successes);

  let p = 0;
  for (let x = Math.max(0, successes - b.n); x <= Math.min(a.n, successes); x++) {
    const deltaX = x / a.n - (successes - x) / b.n;
    if (Math.abs(deltaX) >= Math.abs(delta) - 1e-9) {
      p += Math.exp(logChoose(a.n, x) + logChoose(b.n, successes - x) - logDenominator);
    }
  }
  p = Math.min(1, p);
  return { delta, p, label: differenceLabel(p, a.n, b.n), nA: a.n, nB: b.n };
}

export interface MedianComparisonOptions {
  /** Number of random permutations. Default 5000 (spec A-07). */
  readonly permutations?: number;
  /** Seed of the generator; the default is fixed so results are reproducible. */
  readonly seed?: number;
}

const DEFAULT_PERMUTATIONS = 5000;
const DEFAULT_SEED = 20261015;

/**
 * Compares two samples of a continuous outcome by the difference of medians with a Monte Carlo
 * permutation test (default 5000 shuffles, fixed seed). The p-value is (c + 1) / (N + 1), where c
 * counts shuffles at least as extreme as the observed difference.
 *
 * Returns null when either sample is empty.
 *
 * @throws RangeError for non-finite values or an invalid number of permutations.
 */
export function compareMedians(
  a: readonly number[],
  b: readonly number[],
  options: MedianComparisonOptions = {},
): Comparison | null {
  const permutations = options.permutations ?? DEFAULT_PERMUTATIONS;
  if (!Number.isInteger(permutations) || permutations < 1) {
    throw new RangeError('permutations must be an integer >= 1');
  }
  if (![...a, ...b].every((v) => Number.isFinite(v))) {
    throw new RangeError('all values must be finite numbers');
  }
  if (a.length === 0 || b.length === 0) {
    return null;
  }

  const delta = median(a) - median(b);
  const pool = [...a, ...b];
  const random = mulberry32(options.seed ?? DEFAULT_SEED);
  let atLeastAsExtreme = 0;
  for (let round = 0; round < permutations; round++) {
    // Partial Fisher-Yates: only the first a.length positions are needed for group A.
    for (let i = 0; i < a.length; i++) {
      const j = i + Math.floor(random() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j] ?? 0;
      pool[j] = tmp ?? 0;
    }
    const shuffledDelta = median(pool.slice(0, a.length)) - median(pool.slice(a.length));
    if (Math.abs(shuffledDelta) >= Math.abs(delta) - 1e-12) {
      atLeastAsExtreme += 1;
    }
  }
  const p = (atLeastAsExtreme + 1) / (permutations + 1);
  return { delta, p, label: differenceLabel(p, a.length, b.length), nA: a.length, nB: b.length };
}
