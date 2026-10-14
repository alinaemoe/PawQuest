import { compareProportions, differenceLabel, type DifferenceLabel } from './compare';
import { wilsonInterval, type ProportionInterval } from './proportion';
import { reliability, type Reliability } from './reliability';

/**
 * One record to analyse (a walk or a day): categorical dimensions ("time_of_day" = "evening") and
 * binary outcomes ("hard_moment" = true). Missing entries are simply not part of that comparison.
 */
export interface AnalysisUnit {
  readonly id: string;
  readonly dims: Readonly<Record<string, string | undefined>>;
  readonly outcomes: Readonly<Record<string, boolean | undefined>>;
}

/** Successes and total for one group. */
export interface GroupCount {
  readonly k: number;
  readonly n: number;
  readonly interval: ProportionInterval | null;
}

interface SplitCounts {
  readonly inGroup: { k: number; n: number };
  readonly rest: { k: number; n: number };
}

function split(
  units: readonly AnalysisUnit[],
  dimension: string,
  value: string,
  outcome: string,
): SplitCounts {
  const counts: SplitCounts = { inGroup: { k: 0, n: 0 }, rest: { k: 0, n: 0 } };
  for (const unit of units) {
    const happened = unit.outcomes[outcome];
    const level = unit.dims[dimension];
    if (happened === undefined || level === undefined) {
      continue;
    }
    const target = level === value ? counts.inGroup : counts.rest;
    target.n += 1;
    if (happened) {
      target.k += 1;
    }
  }
  return counts;
}

function groupCount(c: { k: number; n: number }): GroupCount {
  return { k: c.k, n: c.n, interval: wilsonInterval(c.k, c.n) };
}

function dimensionValues(units: readonly AnalysisUnit[], dimension: string): string[] {
  const values = new Set<string>();
  for (const unit of units) {
    const level = unit.dims[dimension];
    if (level !== undefined) {
      values.add(level);
    }
  }
  return [...values].sort();
}

/**
 * Benjamini-Hochberg step-up procedure: returns, for each p-value (same order), whether it is
 * rejected at the false discovery rate `q`. The largest rank i with p(i) <= i / m * q is found and
 * every hypothesis up to that rank is rejected, even if an earlier p-value is above its own line.
 *
 * @throws RangeError for a p-value outside [0, 1] or `q` outside (0, 1].
 */
export function benjaminiHochberg(pValues: readonly number[], q: number): boolean[] {
  if (!Number.isFinite(q) || q <= 0 || q > 1) {
    throw new RangeError('q must be in (0, 1]');
  }
  if (!pValues.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)) {
    throw new RangeError('p-values must be numbers in [0, 1]');
  }
  const m = pValues.length;
  const order = pValues
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p - b.p || a.index - b.index);
  let cutoff = -1;
  order.forEach((entry, rank) => {
    if (entry.p <= ((rank + 1) / m) * q) {
      cutoff = rank;
    }
  });
  const rejected = new Array<boolean>(m).fill(false);
  for (const entry of order.slice(0, cutoff + 1)) {
    rejected[entry.index] = true;
  }
  return rejected;
}

// ---------------------------------------------------------------------------------------------
// A-13: co-occurrence ("lift")

export interface CoOccurrence {
  readonly dimension: string;
  readonly value: string;
  readonly outcome: string;
  /** Units with this value: how often the outcome happened. */
  readonly inCondition: GroupCount;
  /** All other units that have the dimension. */
  readonly rest: GroupCount;
  /** P(E | C) / P(E). */
  readonly lift: number;
  /** Units with the condition and the outcome ("more"), or with the condition and without it ("less"). */
  readonly support: number;
  readonly direction: 'more' | 'less';
}

export interface CoOccurrenceOptions {
  readonly minSupport?: number;
  readonly minGroup?: number;
  readonly minLift?: number;
}

/**
 * Conditions under which an outcome happens more or less often (spec A-13, decision D-52).
 * Shown when support >= 5, the condition covers >= 8 units and lift is >= 1.5 (more) or
 * <= 2/3 (less). Sorted by |ln(lift)|, strongest first. Describes coincidence, never cause.
 */
export function coOccurrences(
  units: readonly AnalysisUnit[],
  outcome: string,
  dimensions: readonly string[],
  options: CoOccurrenceOptions = {},
): CoOccurrence[] {
  const minSupport = options.minSupport ?? 5;
  const minGroup = options.minGroup ?? 8;
  const minLift = options.minLift ?? 1.5;
  const result: CoOccurrence[] = [];

  for (const dimension of dimensions) {
    for (const value of dimensionValues(units, dimension)) {
      const { inGroup, rest } = split(units, dimension, value, outcome);
      const total = inGroup.n + rest.n;
      const overall = (inGroup.k + rest.k) / total;
      if (inGroup.n === 0 || overall === 0) {
        continue;
      }
      const lift = inGroup.k / inGroup.n / overall;
      const more = lift >= minLift;
      const less = lift <= 1 / minLift;
      // Support counts the cell the statement is about: events for "more", non-events for "less".
      const support = more ? inGroup.k : inGroup.n - inGroup.k;
      if (support < minSupport || inGroup.n < minGroup || (!more && !less)) {
        continue;
      }
      result.push({
        dimension,
        value,
        outcome,
        inCondition: groupCount(inGroup),
        rest: groupCount(rest),
        lift,
        support,
        direction: more ? 'more' : 'less',
      });
    }
  }
  return result.sort(
    (a, b) =>
      Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)) || a.value.localeCompare(b.value),
  );
}

// ---------------------------------------------------------------------------------------------
// A-14: pattern cards

export interface PatternCard {
  /** `dimension|value|outcome`: stable id, also used to hide or suppress a card. */
  readonly key: string;
  readonly dimension: string;
  readonly value: string;
  readonly outcome: string;
  readonly inCondition: GroupCount;
  readonly rest: GroupCount;
  /** Share of the outcome in the condition group minus the share in the rest. */
  readonly delta: number;
  readonly label: DifferenceLabel;
  readonly reliability: Reliability;
  /** How many comparisons were tested to find this one ("found among N checked"). */
  readonly testedCount: number;
}

export interface PatternCardOptions {
  /** Keys (`dimension|value|outcome`) that must not be shown now, e.g. shown in the last 7 days. */
  readonly excludeKeys?: ReadonlySet<string>;
  /** False discovery rate for Benjamini-Hochberg. Default 0.2. */
  readonly fdr?: number;
  /** Smallest |difference of shares| worth showing. Default 0.2 (20 percentage points). */
  readonly minAbsDelta?: number;
  /** Maximum number of cards. Default 5. */
  readonly maxCards?: number;
}

export function patternKey(dimension: string, value: string, outcome: string): string {
  return `${dimension}|${value}|${outcome}`;
}

/**
 * Candidate patterns worth showing to the owner (spec A-14, decision D-52): every dimension value
 * against the rest for every outcome, tested exactly (A-07); candidates with fewer than 5 units in
 * a group are dropped; Benjamini-Hochberg with FDR 0.2 filters the survivors; the effect must be
 * at least 20 percentage points; ranked by |delta| * sqrt(smaller group); one card per dimension;
 * at most 5. Cards describe coincidence, never cause.
 */
export function patternCards(
  units: readonly AnalysisUnit[],
  dimensions: readonly string[],
  outcomes: readonly string[],
  options: PatternCardOptions = {},
): PatternCard[] {
  const fdr = options.fdr ?? 0.2;
  const minAbsDelta = options.minAbsDelta ?? 0.2;
  const maxCards = options.maxCards ?? 5;

  interface Candidate {
    card: Omit<PatternCard, 'testedCount'>;
    p: number;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (const outcome of outcomes) {
    for (const dimension of dimensions) {
      for (const value of dimensionValues(units, dimension)) {
        const { inGroup, rest } = split(units, dimension, value, outcome);
        if (Math.min(inGroup.n, rest.n) < 5) {
          continue;
        }
        const comparison = compareProportions(
          { successes: inGroup.k, n: inGroup.n },
          { successes: rest.k, n: rest.n },
        );
        if (comparison === null) {
          continue;
        }
        const nMin = Math.min(inGroup.n, rest.n);
        candidates.push({
          p: comparison.p,
          score: Math.abs(comparison.delta) * Math.sqrt(nMin),
          card: {
            key: patternKey(dimension, value, outcome),
            dimension,
            value,
            outcome,
            inCondition: groupCount(inGroup),
            rest: groupCount(rest),
            delta: comparison.delta,
            label: differenceLabel(comparison.p, inGroup.n, rest.n),
            reliability: reliability(nMin),
          },
        });
      }
    }
  }

  const testedCount = candidates.length;
  const passed = benjaminiHochberg(
    candidates.map((c) => c.p),
    fdr,
  );
  const ranked = candidates
    .filter((c, i) => passed[i] === true && Math.abs(c.card.delta) >= minAbsDelta)
    .filter((c) => options.excludeKeys?.has(c.card.key) !== true)
    .sort((a, b) => b.score - a.score || a.card.key.localeCompare(b.card.key));

  const seenDimensions = new Set<string>();
  const cards: PatternCard[] = [];
  for (const c of ranked) {
    if (seenDimensions.has(c.card.dimension)) {
      continue;
    }
    seenDimensions.add(c.card.dimension);
    cards.push({ ...c.card, testedCount });
    if (cards.length === maxCards) {
      break;
    }
  }
  return cards;
}
