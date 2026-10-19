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

type Dims = ReturnType<typeof listWalkDims>[number]['dims'];

/** Everything a filter looks at, read once, so that many filters can be tried in memory. */
export interface FilterContext {
  readonly rows: readonly { readonly walk: Walk; readonly placeId: string }[];
  readonly dims: ReadonlyMap<string, Dims>;
  readonly eventsOf: ReadonlyMap<string, ReadonlySet<string>>;
  readonly trained: ReadonlySet<string>;
  readonly now: number;
}

export function filterContext(db: SqlDb, dogId: string, now: number): FilterContext {
  const rows = db
    .all(
      `SELECT w.* FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
          AND (w.duration_s IS NULL OR w.duration_s >= ?)
        ORDER BY w.started_at DESC, w.id DESC`,
      [dogId, MIN_WALK_S],
    )
    .map((row) => ({ walk: toWalk(row), placeId: String(row['place_id'] ?? '') }));
  const eventsOf = new Map<string, Set<string>>();
  for (const r of db.all(
    'SELECT walk_id, type_id FROM event WHERE walk_id IS NOT NULL AND dog_id = ? AND deleted_at IS NULL',
    [dogId],
  )) {
    const walkId = String(r['walk_id']);
    eventsOf.set(walkId, (eventsOf.get(walkId) ?? new Set()).add(String(r['type_id'])));
  }
  return {
    rows,
    dims: new Map(listWalkDims(db, dogId).map((d) => [d.walkId, d.dims])),
    eventsOf,
    trained: new Set(
      db
        .all(
          'SELECT DISTINCT walk_id FROM training_session WHERE walk_id IS NOT NULL AND deleted_at IS NULL',
        )
        .map((r) => String(r['walk_id'])),
    ),
    now,
  };
}

/** The walks of a context that satisfy a filter, newest first. */
export function matchWalks(ctx: FilterContext, filter: WalkFilter, limit = 500): FilteredWalks {
  const since = filter.days === null ? 0 : ctx.now - filter.days * DAY;
  const wanted = Object.entries(filter.dims).filter(([, values]) => values.length > 0);
  const needsDims = wanted.length > 0 || filter.outcomes.length > 0;
  const kept: Walk[] = [];
  let pending = 0;
  for (const { walk, placeId } of ctx.rows) {
    if (walk.startedAt < since) {
      continue;
    }
    if (filter.placeIds.length > 0 && !filter.placeIds.includes(placeId)) {
      continue;
    }
    if (
      filter.eventTypes.length > 0 &&
      !filter.eventTypes.some((t) => ctx.eventsOf.get(walk.id)?.has(t) === true)
    ) {
      continue;
    }
    if (filter.training && !ctx.trained.has(walk.id)) {
      continue;
    }
    if (needsDims) {
      const known = ctx.dims.get(walk.id);
      if (known === undefined) {
        pending += 1;
        continue;
      }
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

export function filterWalks(
  db: SqlDb,
  dogId: string,
  filter: WalkFilter,
  now: number,
  limit = 500,
): FilteredWalks {
  return matchWalks(filterContext(db, dogId, now), filter, limit);
}

export interface FilterFacets {
  /** Walks that match the filter, with the time and the distance of them. */
  readonly total: number;
  readonly durationS: number;
  readonly distanceM: number;
  /** For each option of a group: the walks the filter gives with this option alone chosen in the group. */
  readonly dims: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly eventTypes: Readonly<Record<string, number>>;
  readonly places: Readonly<Record<string, number>>;
  readonly training: number;
  /** By period: the key is the days, or "all". */
  readonly periods: Readonly<Record<string, number>>;
}

const FACET_DIMS = {
  ground: ['dry', 'damp', 'wet', 'snow', 'icy'],
  light: ['day', 'twilight', 'dark'],
  place_kind: ['green', 'streets', 'water', 'errands', 'base'],
} as const;

/**
 * How many walks each option would give, so the filter can show what a choice is worth before it
 * is made (an option with none is faded). Each count is the filter with that group reduced to the
 * one option; the other groups stay as they are.
 */
export function filterFacets(
  db: SqlDb,
  dogId: string,
  filter: WalkFilter,
  options: FilterOptions,
  now: number,
): FilterFacets {
  const ctx = filterContext(db, dogId, now);
  const count = (f: WalkFilter): number => matchWalks(ctx, f).walks.length;
  const matched = matchWalks(ctx, filter).walks;
  return {
    total: matched.length,
    durationS: matched.reduce((sum, w) => sum + (w.durationS ?? 0), 0),
    distanceM: matched.reduce((sum, w) => sum + (w.distanceM ?? 0), 0),
    dims: Object.fromEntries(
      Object.entries(FACET_DIMS).map(([key, values]) => [
        key,
        Object.fromEntries(
          values.map((v) => [v, count({ ...filter, dims: { ...filter.dims, [key]: [v] } })]),
        ),
      ]),
    ),
    outcomes: Object.fromEntries(
      (['hard_moment', 'success'] as const).map((o) => [o, count({ ...filter, outcomes: [o] })]),
    ),
    eventTypes: Object.fromEntries(
      options.eventTypes.map((t) => [t, count({ ...filter, eventTypes: [t] })]),
    ),
    places: Object.fromEntries(
      options.places.map((p) => [p.id, count({ ...filter, placeIds: [p.id] })]),
    ),
    training: count({ ...filter, training: true }),
    periods: Object.fromEntries(
      [null, 7, 30, 90].map((d) => [d === null ? 'all' : String(d), count({ ...filter, days: d })]),
    ),
  };
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
