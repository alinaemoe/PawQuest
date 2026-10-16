import type { AnalysisUnit, PatternCard } from './patterns';

/**
 * "Is it the weather, or is it the place?" (docs/21, A-32). A pattern found between two groups may
 * really be about something else that travels with the group: dry weather and parks go together,
 * evenings and weekends go together. This checks a pattern against such other dimensions by
 * comparing the groups only within the same level of the other dimension (a stratified difference
 * of shares, Mantel-Haenszel weights): if the difference mostly or entirely disappears there, the
 * pattern is explained by the other dimension and is not shown as a finding of its own.
 */

export type AdjustmentStatus = 'holds' | 'confounded' | 'unchecked';

export interface Adjustment {
  readonly status: AdjustmentStatus;
  /** For `confounded`: the dimension that explains the pattern. */
  readonly by?: string;
  /** The difference of shares within the levels of the checked dimensions (the smallest in size). */
  readonly adjustedDelta: number | null;
}

export interface AdjustOptions {
  /** The adjusted difference smaller than this share of the plain one counts as "gone". Default 0.5. */
  readonly keepShare?: number;
  /** A check needs at least this many units that can be compared within a level. Default 10. */
  readonly minUnits?: number;
}

interface Stratum {
  inK: number;
  inN: number;
  restK: number;
  restN: number;
}

/**
 * The difference of shares between the group and the rest, taken within the levels of `context`
 * and averaged with weights n1*n0/(n1+n0). `null` when it cannot be told: fewer than two levels
 * where both groups are present, or fewer than `minUnits` units in them.
 */
export function stratifiedDelta(
  units: readonly AnalysisUnit[],
  dimension: string,
  value: string,
  outcome: string,
  context: string,
  minUnits = 10,
): number | null {
  const strata = new Map<string, Stratum>();
  for (const unit of units) {
    const level = unit.dims[dimension];
    const stratum = unit.dims[context];
    const happened = unit.outcomes[outcome];
    if (level === undefined || stratum === undefined || happened === undefined) {
      continue;
    }
    const s = strata.get(stratum) ?? { inK: 0, inN: 0, restK: 0, restN: 0 };
    if (level === value) {
      s.inN += 1;
      s.inK += happened ? 1 : 0;
    } else {
      s.restN += 1;
      s.restK += happened ? 1 : 0;
    }
    strata.set(stratum, s);
  }
  let weighted = 0;
  let weights = 0;
  let usable = 0;
  let usableUnits = 0;
  for (const s of strata.values()) {
    if (s.inN === 0 || s.restN === 0) {
      continue;
    }
    const w = (s.inN * s.restN) / (s.inN + s.restN);
    weighted += w * (s.inK / s.inN - s.restK / s.restN);
    weights += w;
    usable += 1;
    usableUnits += s.inN + s.restN;
  }
  return usable < 2 || usableUnits < minUnits || weights === 0 ? null : weighted / weights;
}

/**
 * Checks a card against the given other dimensions. `holds` when at least one of them could be
 * checked and none explained the pattern; `confounded` (naming the dimension that explains it
 * most) when the within-level difference is under half of the plain one or points the other way;
 * `unchecked` when no other dimension had enough data to tell (shown with that note).
 */
export function checkCard(
  units: readonly AnalysisUnit[],
  card: Pick<PatternCard, 'dimension' | 'value' | 'outcome' | 'delta'>,
  contexts: readonly string[],
  options: AdjustOptions = {},
): Adjustment {
  const keep = options.keepShare ?? 0.5;
  const minUnits = options.minUnits ?? 10;
  let checked = 0;
  let worst: { by: string; adjusted: number } | null = null;
  let smallest: number | null = null;
  for (const context of contexts) {
    if (context === card.dimension) {
      continue;
    }
    const adjusted = stratifiedDelta(
      units,
      card.dimension,
      card.value,
      card.outcome,
      context,
      minUnits,
    );
    if (adjusted === null) {
      continue;
    }
    checked += 1;
    smallest = smallest === null || Math.abs(adjusted) < Math.abs(smallest) ? adjusted : smallest;
    const gone =
      Math.sign(adjusted) !== Math.sign(card.delta) ||
      Math.abs(adjusted) < keep * Math.abs(card.delta);
    if (gone && (worst === null || Math.abs(adjusted) < Math.abs(worst.adjusted))) {
      worst = { by: context, adjusted };
    }
  }
  if (checked === 0) {
    return { status: 'unchecked', adjustedDelta: null };
  }
  return worst === null
    ? { status: 'holds', adjustedDelta: smallest }
    : { status: 'confounded', by: worst.by, adjustedDelta: worst.adjusted };
}
