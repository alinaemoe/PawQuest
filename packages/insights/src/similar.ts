import { median } from '@pawquest/core';

/**
 * "With what to compare this walk" (docs/23, step 3.6, A-30). A walk is compared with walks like
 * it: the same kind of place and the same kind of walk, then, when there are too few of those,
 * with a wider circle, and the wider circle is always told. Never a 10-minute yard walk against a
 * 90-minute park walk without saying so.
 */

export interface SimilarWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly dims: Readonly<Record<string, string | undefined>>;
}

/** A circle of comparison: the dimensions the other walks must share with this one. */
export type SimilarityLevel = readonly string[];

/** Narrow to wide: the same kind of place and walk, then either alone, then any walk. */
export const SIMILAR_WALK_LEVELS: readonly SimilarityLevel[] = [
  ['place_kind', 'walk_type'],
  ['place_kind'],
  ['walk_type'],
  [],
];

/** For "in weather like today's": the same ground, temperature band and light, then less. */
export const SIMILAR_WEATHER_LEVELS: readonly SimilarityLevel[] = [
  ['ground', 'temp', 'light'],
  ['ground', 'temp'],
  ['ground'],
];

/** At least this many walks make a "usual" (below it nothing is said). */
export const MIN_SIMILAR = 5;

export interface SimilarResult<T extends SimilarWalk> {
  /** The walks of the circle, newest first, without the walk itself. */
  readonly walks: readonly T[];
  /** The dimensions they share with the target. */
  readonly keys: SimilarityLevel;
  /** Index of the circle in the list of levels, 0 = the narrowest. */
  readonly level: number;
  /** A wider circle than the narrowest had to be used. */
  readonly widened: boolean;
}

/**
 * The walks like `target`: the narrowest level that has at least `minCount` other walks. A level
 * the target cannot be described by (a dimension it does not have) is skipped. `null` when no
 * level has enough walks.
 */
export function similarWalks<T extends SimilarWalk>(
  all: readonly T[],
  target: SimilarWalk,
  levels: readonly SimilarityLevel[] = SIMILAR_WALK_LEVELS,
  minCount = MIN_SIMILAR,
): SimilarResult<T> | null {
  const others = all.filter((w) => w.id !== target.id);
  let firstUsable = -1;
  for (let i = 0; i < levels.length; i += 1) {
    const keys = levels[i] ?? [];
    if (keys.some((k) => target.dims[k] === undefined)) {
      continue;
    }
    if (firstUsable === -1) {
      firstUsable = i;
    }
    const walks = others
      .filter((w) => keys.every((k) => w.dims[k] === target.dims[k]))
      .sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
    if (walks.length >= minCount) {
      return { walks, keys, level: i, widened: i > firstUsable };
    }
  }
  return null;
}

export interface UsualStats {
  readonly n: number;
  readonly median: number;
  /** The middle half of the values: where most of them lie. */
  readonly q1: number;
  readonly q3: number;
  readonly min: number;
  readonly max: number;
}

function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below] ?? 0;
  const high = sorted[above] ?? low;
  return low + (high - low) * (position - below);
}

/** The usual value of a set of numbers: median and the middle half; `null` for none at all. */
export function usualStats(values: readonly number[]): UsualStats | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) {
    return null;
  }
  const sorted = [...clean].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: median(sorted),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export interface UsualComparison {
  readonly kind: 'shorter' | 'usual' | 'longer';
  /** The difference from the median, always positive (0 for "usual"), in the unit of the values. */
  readonly diff: number;
}

export interface UsualRule {
  /** A difference under this (in the unit of the values) is the usual. */
  readonly floor: number;
  /** ... and so is a difference under this share of the median. Default 0.1. */
  readonly share?: number;
}

/**
 * How a value stands against the usual: "usual" within the larger of the floor and a tenth of the
 * median, otherwise longer or shorter (more or less) by how much. A fact, not a grade.
 */
export function compareToUsual(
  value: number,
  usual: Pick<UsualStats, 'median'>,
  rule: UsualRule,
): UsualComparison {
  const diff = value - usual.median;
  if (Math.abs(diff) <= Math.max(rule.floor, usual.median * (rule.share ?? 0.1))) {
    return { kind: 'usual', diff: 0 };
  }
  return { kind: diff > 0 ? 'longer' : 'shorter', diff: Math.abs(diff) };
}
