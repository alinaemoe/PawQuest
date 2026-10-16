import { median } from '@pawquest/core';

import { compareMedians, compareProportions, type DifferenceLabel } from './compare';
import { wilsonInterval, type ProportionInterval } from './proportion';

/**
 * Two periods side by side (docs/23, step 3.9, S13-Cmp): totals as plain facts, the typical walk
 * and the shares of walks with a hard moment or a success with an honest label. Nothing is said
 * about which period was "better"; a difference is a difference.
 */

export interface PeriodWalk {
  readonly startedAt: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  /** A hard moment happened; undefined when it is not known for the walk. */
  readonly hard: boolean | undefined;
  readonly success: boolean | undefined;
}

export type ComparisonKey = 'walks' | 'time' | 'distance' | 'typicalWalk' | 'hard' | 'success';

export interface ComparisonRow {
  readonly key: ComparisonKey;
  readonly a: number | null;
  readonly b: number | null;
  /** A minus B; null when one side is unknown. */
  readonly diff: number | null;
  /** Walks behind each side (for the measures that are about a group of walks). */
  readonly nA: number;
  readonly nB: number;
  /** What to tell about the difference; null for plain totals, which are only counted. */
  readonly label: DifferenceLabel | null;
  /** The share with its interval, for the shares. */
  readonly intervalA: ProportionInterval | null;
  readonly intervalB: ProportionInterval | null;
}

const sum = (values: readonly (number | null)[]): number =>
  values.reduce<number>((total, v) => total + (v ?? 0), 0);

function share(
  a: readonly PeriodWalk[],
  b: readonly PeriodWalk[],
  key: ComparisonKey,
  pick: (w: PeriodWalk) => boolean | undefined,
): ComparisonRow {
  const known = (walks: readonly PeriodWalk[]): boolean[] =>
    walks.flatMap((w) => {
      const v = pick(w);
      return v === undefined ? [] : [v];
    });
  const ka = known(a);
  const kb = known(b);
  const countA = ka.filter(Boolean).length;
  const countB = kb.filter(Boolean).length;
  const comparison =
    ka.length === 0 || kb.length === 0
      ? null
      : compareProportions(
          { successes: countA, n: ka.length },
          { successes: countB, n: kb.length },
        );
  return {
    key,
    a: ka.length === 0 ? null : countA / ka.length,
    b: kb.length === 0 ? null : countB / kb.length,
    diff: ka.length === 0 || kb.length === 0 ? null : countA / ka.length - countB / kb.length,
    nA: ka.length,
    nB: kb.length,
    label:
      comparison === null
        ? ka.length === 0 || kb.length === 0
          ? 'insufficient'
          : null
        : comparison.label,
    intervalA: wilsonInterval(countA, ka.length),
    intervalB: wilsonInterval(countB, kb.length),
  };
}

/** The rows of the comparison table; `a` is the later period, `b` the one it is compared with. */
export function comparePeriods(
  a: readonly PeriodWalk[],
  b: readonly PeriodWalk[],
): ComparisonRow[] {
  const total = (key: ComparisonKey, va: number, vb: number): ComparisonRow => ({
    key,
    a: va,
    b: vb,
    diff: va - vb,
    nA: a.length,
    nB: b.length,
    label: null,
    intervalA: null,
    intervalB: null,
  });
  const durationsA = a.flatMap((w) => (w.durationS === null ? [] : [w.durationS]));
  const durationsB = b.flatMap((w) => (w.durationS === null ? [] : [w.durationS]));
  const typical = compareMedians(durationsA, durationsB);
  return [
    total('walks', a.length, b.length),
    total('time', sum(a.map((w) => w.durationS)), sum(b.map((w) => w.durationS))),
    total('distance', sum(a.map((w) => w.distanceM)), sum(b.map((w) => w.distanceM))),
    {
      key: 'typicalWalk',
      a: durationsA.length === 0 ? null : median(durationsA),
      b: durationsB.length === 0 ? null : median(durationsB),
      diff: typical === null ? null : typical.delta,
      nA: durationsA.length,
      nB: durationsB.length,
      label: typical === null ? 'insufficient' : typical.label,
      intervalA: null,
      intervalB: null,
    },
    share(a, b, 'hard', (w) => w.hard),
    share(a, b, 'success', (w) => w.success),
  ];
}
