import {
  WALK_DIMENSION_KEYS,
  WALK_OUTCOME_KEYS,
  checkedPatternCards,
  type AnalysisUnit,
  type CheckedCard,
} from '@pawquest/insights';

import { derivedHealth, listWalkDims, type DerivedHealth } from './derived';
import type { SqlDb } from './sql';

/**
 * The analysis units of a dog (docs/21, A-33): one per finished walk whose derived data is current,
 * oldest first. A walk that is not yet worked out, or could not be, is simply not in the list: the
 * numbers shown never include a guess.
 */
export function buildAnalysisUnits(
  db: SqlDb,
  dogId: string,
  options: { readonly sinceTs?: number } = {},
): AnalysisUnit[] {
  return listWalkDims(db, dogId, options).map((row) => ({
    id: row.walkId,
    dims: row.dims.dims,
    outcomes: row.dims.outcomes,
  }));
}

export interface WalkPatterns {
  /** Patterns that hold when the other kinds of dimension are held still (or could not be checked). */
  readonly cards: readonly CheckedCard[];
  /** Patterns that something else explains: "it looks like the weather, but it is the place". */
  readonly explained: readonly CheckedCard[];
  /** How many walks the cards were found among. */
  readonly unitCount: number;
  /** Where the derived layer stands: `stale > 0` means "still counting". */
  readonly health: DerivedHealth;
}

/**
 * Pattern cards for the walks of a dog (A-14 over the catalog of dimensions and outcomes, each checked against the other families of dimensions: A-32). It only
 * reads: the derived layer is brought up to date by `refreshDerived`, in the background.
 */
export function walkPatterns(
  db: SqlDb,
  dogId: string,
  options: { readonly excludeKeys?: ReadonlySet<string>; readonly sinceTs?: number } = {},
): WalkPatterns {
  const units = buildAnalysisUnits(
    db,
    dogId,
    options.sinceTs === undefined ? {} : { sinceTs: options.sinceTs },
  );
  const { cards, explained } = checkedPatternCards(
    units,
    WALK_DIMENSION_KEYS,
    WALK_OUTCOME_KEYS,
    options.excludeKeys === undefined ? {} : { excludeKeys: options.excludeKeys },
  );
  return { cards, explained, unitCount: units.length, health: derivedHealth(db, dogId) };
}
