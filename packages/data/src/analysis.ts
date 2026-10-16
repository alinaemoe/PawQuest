import {
  WALK_DIMENSION_KEYS,
  WALK_OUTCOME_KEYS,
  checkedPatternCards,
  preliminaryCards,
  type AnalysisUnit,
  type CheckedCard,
  type PreliminaryCard,
} from '@pawquest/insights';

import { hidePrompt } from './demo';
import { derivedHealth, listWalkDims, type DerivedHealth } from './derived';
import { fromIso, type Ctx } from './ids';
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
  /**
   * Observations from a small number of walks, a section of their own, very preliminary (docs/23,
   * 3.3): only between 15 and 59 walks, and never the ones that are findings already.
   */
  readonly preliminary: readonly PreliminaryCard[];
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
  const taken = new Set([...(options.excludeKeys ?? []), ...cards.map((c) => c.key)]);
  const preliminary = preliminaryCards(units, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS, {
    excludeKeys: taken,
  });
  return {
    cards,
    explained,
    preliminary,
    unitCount: units.length,
    health: derivedHealth(db, dogId),
  };
}

const HIDDEN_PREFIX = 'insight:';
const WEEK = 7 * 86_400_000;
const FOREVER = 3650 * 86_400_000;

/** Hides a card (its `dimension|value|outcome` key) for a week or for good. */
export function hideInsight(db: SqlDb, ctx: Ctx, key: string, forever: boolean): void {
  hidePrompt(db, ctx, `${HIDDEN_PREFIX}${key}`, ctx.now() + (forever ? FOREVER : WEEK));
}

/** The keys of the cards that are hidden right now. */
export function hiddenInsightKeys(db: SqlDb, now: number): Set<string> {
  return new Set(
    db
      .all('SELECT key, hidden_until FROM prompt_state WHERE key LIKE ?', [`${HIDDEN_PREFIX}%`])
      .filter((r) => {
        const until = r['hidden_until'];
        return typeof until === 'string' && fromIso(until) > now;
      })
      .map((r) => String(r['key']).slice(HIDDEN_PREFIX.length)),
  );
}

export interface CardWalk {
  readonly walkId: string;
  readonly startedAt: number;
  readonly durationS: number | null;
  /** The outcome of the card happened on this walk. */
  readonly hit: boolean;
}

/** The walks a card was counted from on its own side (the group), newest first: "Show the walks". */
export function cardWalks(
  db: SqlDb,
  dogId: string,
  card: { readonly dimension: string; readonly value: string; readonly outcome: string },
): CardWalk[] {
  const durations = new Map(
    db
      .all(
        `SELECT w.id, w.duration_s FROM walk w JOIN walk_dog d ON d.walk_id = w.id
          WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL`,
        [dogId],
      )
      .map((r) => [String(r['id']), r['duration_s'] === null ? null : Number(r['duration_s'])]),
  );
  return listWalkDims(db, dogId)
    .filter(
      (row) => row.dims.dims[card.dimension] === card.value && card.outcome in row.dims.outcomes,
    )
    .map((row) => ({
      walkId: row.walkId,
      startedAt: row.startedAt,
      durationS: durations.get(row.walkId) ?? null,
      hit: row.dims.outcomes[card.outcome] === true,
    }))
    .sort((a, b) => b.startedAt - a.startedAt);
}
