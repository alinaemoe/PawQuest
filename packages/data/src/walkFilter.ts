import { listWalkDims } from './derived';
import type { Ctx } from './ids';
import { toWalk } from './walks';
import type { Walk } from './walks';
import type { SqlDb } from './sql';

/**
 * Filters of the walk history and the folders they are saved in (docs/23, step 3.17). A filter is
 * a few conditions that all have to hold; inside one condition any of the chosen values will do.
 * A walk is a walk from two minutes; one that is not worked out yet cannot be told by weather,
 * light or kind of place, so it stays out of a filter on those and is counted as "not yet".
 */

export interface WalkFilter {
  /** Only the last this many days; null for all time. */
  readonly days: number | null;
  /** The walk was in one of these saved places. */
  readonly placeIds: readonly string[];
  /** Dimension (ground, light, place_kind, time_of_day, temp, ...) to the values wanted. */
  readonly dims: Readonly<Record<string, readonly string[]>>;
  /** There is at least one event of one of these types. */
  readonly eventTypes: readonly string[];
  /** A hard moment, or a success, was recorded. */
  readonly outcomes: readonly ('hard_moment' | 'success')[];
  /** There was a training during the walk. */
  readonly training: boolean;
}

export const EMPTY_FILTER: WalkFilter = {
  days: null,
  placeIds: [],
  dims: {},
  eventTypes: [],
  outcomes: [],
  training: false,
};

/** How many conditions are set (the period counts as one). */
export function countConditions(filter: WalkFilter): number {
  return (
    (filter.days === null ? 0 : 1) +
    (filter.placeIds.length > 0 ? 1 : 0) +
    Object.values(filter.dims).filter((v) => v.length > 0).length +
    (filter.eventTypes.length > 0 ? 1 : 0) +
    (filter.outcomes.length > 0 ? 1 : 0) +
    (filter.training ? 1 : 0)
  );
}

export interface FilteredWalks {
  readonly walks: Walk[];
  /** Walks that would need the weather or the place worked out first: not counted yet. */
  readonly pending: number;
}

const MIN_WALK_S = 120;
const DAY = 86_400_000;

export function filterWalks(
  db: SqlDb,
  dogId: string,
  filter: WalkFilter,
  now: number,
  limit = 500,
): FilteredWalks {
  const since = filter.days === null ? 0 : now - filter.days * DAY;
  const rows = db.all(
    `SELECT w.* FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND (w.duration_s IS NULL OR w.duration_s >= ?) AND w.started_at >= ?
      ORDER BY w.started_at DESC, w.id DESC`,
    [dogId, MIN_WALK_S, new Date(since).toISOString()],
  );
  const needsDims =
    Object.values(filter.dims).some((v) => v.length > 0) || filter.outcomes.length > 0;
  const dims = needsDims
    ? new Map(listWalkDims(db, dogId).map((d) => [d.walkId, d.dims]))
    : new Map<string, never>();
  const eventsOf = new Map<string, Set<string>>();
  if (filter.eventTypes.length > 0) {
    for (const r of db.all(
      'SELECT walk_id, type_id FROM event WHERE walk_id IS NOT NULL AND dog_id = ? AND deleted_at IS NULL',
      [dogId],
    )) {
      const walkId = String(r['walk_id']);
      eventsOf.set(walkId, (eventsOf.get(walkId) ?? new Set()).add(String(r['type_id'])));
    }
  }
  const trained = new Set(
    filter.training
      ? db
          .all(
            'SELECT DISTINCT walk_id FROM training_session WHERE walk_id IS NOT NULL AND deleted_at IS NULL',
          )
          .map((r) => String(r['walk_id']))
      : [],
  );

  const kept: Walk[] = [];
  let pending = 0;
  for (const row of rows) {
    const walk = toWalk(row);
    if (filter.placeIds.length > 0 && !filter.placeIds.includes(String(row['place_id'] ?? ''))) {
      continue;
    }
    if (
      filter.eventTypes.length > 0 &&
      !filter.eventTypes.some((t) => eventsOf.get(walk.id)?.has(t) === true)
    ) {
      continue;
    }
    if (filter.training && !trained.has(walk.id)) {
      continue;
    }
    if (needsDims) {
      const known = dims.get(walk.id);
      if (known === undefined) {
        pending += 1;
        continue;
      }
      const wanted = Object.entries(filter.dims).filter(([, values]) => values.length > 0);
      if (!wanted.every(([key, values]) => values.includes(known.dims[key] ?? ''))) {
        continue;
      }
      if (filter.outcomes.length > 0 && !filter.outcomes.some((o) => known.outcomes[o] === true)) {
        continue;
      }
    }
    kept.push(walk);
    if (kept.length >= limit) {
      break;
    }
  }
  return { walks: kept, pending };
}

export interface WalkFolder {
  readonly id: string;
  readonly name: string;
  readonly filter: WalkFilter;
}

/** What is stored may have been written by another version: missing parts take their defaults. */
export function parseFilter(raw: unknown): WalkFilter {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const dimsRaw = (typeof o['dims'] === 'object' && o['dims'] !== null ? o['dims'] : {}) as Record<
    string,
    unknown
  >;
  return {
    days: typeof o['days'] === 'number' && o['days'] > 0 ? o['days'] : null,
    placeIds: strings(o['placeIds']),
    dims: Object.fromEntries(
      Object.entries(dimsRaw)
        .map(([k, v]) => [k, strings(v)] as const)
        .filter(([, v]) => v.length > 0),
    ),
    eventTypes: strings(o['eventTypes']),
    outcomes: strings(o['outcomes']).filter(
      (x): x is 'hard_moment' | 'success' => x === 'hard_moment' || x === 'success',
    ),
    training: o['training'] === true,
  };
}

export function listFolders(db: SqlDb): WalkFolder[] {
  return db
    .all('SELECT id, name, definition FROM saved_filter ORDER BY created_at, id')
    .flatMap((r) => {
      try {
        return [
          {
            id: String(r['id']),
            name: String(r['name']),
            filter: parseFilter(JSON.parse(String(r['definition']))),
          },
        ];
      } catch {
        return []; // an unreadable folder is a gap, not a crash
      }
    });
}

export function saveFolder(db: SqlDb, ctx: Ctx, name: string, filter: WalkFilter): WalkFolder {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new RangeError('A folder needs a name');
  }
  const id = ctx.newId();
  const now = new Date(ctx.now()).toISOString();
  db.run(
    'INSERT INTO saved_filter (id, name, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, trimmed, JSON.stringify(filter), now, now],
  );
  return { id, name: trimmed, filter };
}

export function deleteFolder(db: SqlDb, id: string): boolean {
  return db.run('DELETE FROM saved_filter WHERE id = ?', [id]).changes > 0;
}

/** What a filter can be made of for this dog: the places and the kinds of event that occur. */
export interface FilterOptions {
  readonly places: readonly { readonly id: string; readonly name: string }[];
  readonly eventTypes: readonly string[];
}

export function filterOptions(db: SqlDb, dogId: string): FilterOptions {
  return {
    places: db
      .all(
        `SELECT DISTINCT p.id, p.name FROM place p JOIN walk w ON w.place_id = p.id
          JOIN walk_dog d ON d.walk_id = w.id
         WHERE d.dog_id = ? AND w.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY p.name`,
        [dogId],
      )
      .map((r) => ({ id: String(r['id']), name: String(r['name']) })),
    eventTypes: db
      .all(
        'SELECT DISTINCT type_id FROM event WHERE dog_id = ? AND walk_id IS NOT NULL AND deleted_at IS NULL ORDER BY type_id',
        [dogId],
      )
      .map((r) => String(r['type_id'])),
  };
}
