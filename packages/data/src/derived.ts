import {
  filterTrack,
  mainPlace,
  placeContaining,
  ringAreaM2,
  zoneVisits,
  type ChronoPlace,
} from '@pawquest/core';
import { WALK_DIMENSIONS_VERSION, walkDimensions, walkOutcomes } from '@pawquest/insights';
import { WEATHER_DIMENSIONS_VERSION, weatherDimensions } from '@pawquest/weather';

import { walkChronology } from './chronology';
import { toIso, type Ctx } from './ids';
import { isBasePlace, listPlaces } from './places';
import { listTrackPoints } from './recorder';
import type { SqlDb, SqlRow } from './sql';
import { getWeatherSnapshot } from './weather';

/**
 * The derived layer (docs/21, D-63): what is worked out from the facts of a walk (its track, the
 * places, the weather, the events) and kept so that analysis does not repeat the work.
 *
 * - **Never the truth.** Every row can be deleted and made again from the facts.
 * - **Versioned.** A row says by which rule it was made (`algo_version`); when the rule changes the
 *   row is made again, lazily and in small steps.
 * - **Fingerprinted.** A row says from which facts it was made; when a fact changes (a place is
 *   named, the weather arrives, an event is edited) only the walks it touches are made again.
 * - **Fault tolerant.** One walk is one transaction; a walk that cannot be worked out leaves an
 *   `error` row (so it is not tried again and again) and never stops the others; a run can be cut
 *   at any moment and continued.
 */

export type DerivedKind = 'structure' | 'dims';

/** A walk shorter than this is a slip of the finger or a test, not a walk: no analysis counts it. */
export const MIN_ANALYSED_WALK_S = 120;
const LONG_ENOUGH = `(w.duration_s IS NULL OR w.duration_s >= ${String(MIN_ANALYSED_WALK_S)})`;

/** The rule version of each kind: raise it when the rule (or a band it uses) changes. */
export const DERIVED_VERSIONS: Readonly<Record<DerivedKind, number>> = {
  // 2: the zones (where the walk was, by the saved places) and the place the walk mostly was in
  structure: 2,
  dims: WALK_DIMENSIONS_VERSION * 100 + WEATHER_DIMENSIONS_VERSION,
};

const KINDS: readonly DerivedKind[] = ['structure', 'dims'];

export interface StructureJson {
  readonly hasTrack: boolean;
  readonly title: string | null;
  readonly startPlaceCategory: string | null;
  readonly endPlaceCategory: string | null;
  readonly visitCount: number;
  readonly shopVisit: boolean;
  readonly rideS: number;
  /** Where the walk was by the saved places: each visit with its time inside (D-73). */
  readonly zones?: readonly {
    readonly placeId: string;
    readonly fromTs: number;
    readonly toTs: number;
    readonly dwellS: number;
  }[];
  /** The place the walk was mostly in, when the owner has not picked one; null when none. */
  readonly mainPlaceId?: string | null;
}

export interface DimsJson {
  readonly dims: Readonly<Record<string, string>>;
  readonly outcomes: Readonly<Record<string, boolean>>;
}

const compact = <T extends string | boolean>(
  record: Readonly<Record<string, T | undefined>>,
): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter((e): e is [string, T] => e[1] !== undefined));

/** What a row was made from, as a short string: equal facts give an equal string. */
export function fingerprint(db: SqlDb, walkId: string): string {
  const one = (sql: string, params: readonly (string | number)[]): SqlRow | undefined =>
    db.all(sql, [...params])[0];
  const walk = one(
    'SELECT updated_at, ended_at, place_id, summary_pending, tz_offset_min FROM walk WHERE id = ?',
    [walkId],
  );
  const track = one(
    'SELECT COUNT(*) AS n, MAX(ts) AS last, SUM(excluded) AS cut FROM track_point WHERE walk_id = ?',
    [walkId],
  );
  const segments = one(
    'SELECT COUNT(*) AS n, SUM(indoor) AS indoor FROM walk_segment WHERE walk_id = ?',
    [walkId],
  );
  const places = one(
    'SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM place WHERE deleted_at IS NULL',
    [],
  );
  const weather = one(
    'SELECT fetched_at, LENGTH(facts_json) AS size FROM weather_snapshot WHERE walk_id = ?',
    [walkId],
  );
  const events = one(
    `SELECT COUNT(*) AS n, MAX(updated_at) AS last, SUM(COALESCE(reaction, 0)) AS reactions
       FROM event WHERE walk_id = ? AND deleted_at IS NULL`,
    [walkId],
  );
  const part = (row: SqlRow | undefined): string =>
    row === undefined
      ? '-'
      : Object.values(row)
          .map((v) => String(v ?? ''))
          .join(',');
  return [walk, track, segments, places, weather, events].map(part).join('|');
}

function placeRows(db: SqlDb): { place: ChronoPlace; category: string }[] {
  return listPlaces(db).map((p) => ({
    place: {
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      radiusM: p.radiusM,
      boundary: p.boundary ?? undefined,
    },
    category: p.category,
  }));
}

/** Where a walk went in terms of its places: the ends, the visits, the rides. */
export function computeStructure(db: SqlDb, walkId: string, now: number): StructureJson {
  const points = filterTrack(listTrackPoints(db, walkId)).points;
  const chronology = points.length < 2 ? null : walkChronology(db, walkId, now);
  if (chronology === null) {
    return {
      hasTrack: false,
      title: null,
      startPlaceCategory: null,
      endPlaceCategory: null,
      visitCount: 0,
      shopVisit: false,
      rideS: 0,
      zones: [],
      mainPlaceId: null,
    };
  }
  const rows = placeRows(db);
  const categoryOf = new Map(rows.map((r) => [r.place.id, r.category]));
  const places = rows.map((r) => r.place);
  const first = points[0];
  const last = points[points.length - 1];
  const at = (p: typeof first): string | null => {
    const found = p === undefined ? null : placeContaining(p, places);
    return found === null ? null : (categoryOf.get(found.id) ?? null);
  };
  const visits = chronology.steps.flatMap((s) => (s.kind === 'visit' ? [s] : []));
  const zones = zoneVisits(
    points.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, accuracyM: p.accuracyM })),
    places,
  );
  const baseIds = new Set(
    listPlaces(db)
      .filter((p) => isBasePlace(p.category))
      .map((p) => p.id),
  );
  return {
    hasTrack: true,
    title: chronology.title,
    startPlaceCategory: at(first),
    endPlaceCategory: at(last),
    visitCount: visits.length,
    shopVisit: visits.some((v) => v.placeId !== null && categoryOf.get(v.placeId) === 'shop'),
    rideS: Math.round(
      chronology.steps.reduce((sum, s) => (s.kind === 'ride' ? sum + s.durationS : sum), 0),
    ),
    zones: zones.map((z) => ({
      placeId: z.placeId,
      fromTs: z.fromTs,
      toTs: z.toTs,
      dwellS: Math.round(z.dwellS),
    })),
    mainPlaceId: mainPlace(zones, { baseIds }),
  };
}

/** The dimensions and outcomes of a walk; `structure` is what `computeStructure` gave (or null). */
export function computeDims(db: SqlDb, walkId: string, structure: StructureJson | null): DimsJson {
  // the place the owner picked; else the one the walk was mostly in (D-73)
  const row = db.all(
    `SELECT w.started_at, w.tz_offset_min, w.duration_s, w.summary_pending, w.place_id,
            p.category AS place_category, p.radius_m AS place_radius, p.boundary AS place_boundary
       FROM walk w LEFT JOIN place p ON p.id = COALESCE(w.place_id, ?) WHERE w.id = ?`,
    [structure?.mainPlaceId ?? null, walkId],
  )[0];
  if (row === undefined) {
    throw new Error('Walk not found');
  }
  let radiusM: number | null = row['place_radius'] === null ? null : Number(row['place_radius']);
  if (typeof row['place_boundary'] === 'string') {
    const ring = (JSON.parse(row['place_boundary']) as [number, number][]).map(([lat, lon]) => ({
      lat,
      lon,
    }));
    radiusM = Math.sqrt(ringAreaM2(ring) / Math.PI);
  }
  const startedAt = Date.parse(String(row['started_at']));
  const dims = walkDimensions({
    startedAt,
    tzOffsetMin: Number(row['tz_offset_min'] ?? 0),
    durationS: row['duration_s'] === null ? null : Number(row['duration_s']),
    placeCategory: row['place_category'] === null ? null : String(row['place_category']),
    placeRadiusM: radiusM,
    startPlaceCategory: structure?.startPlaceCategory ?? null,
    endPlaceCategory: structure?.endPlaceCategory ?? null,
    shopVisit: structure?.hasTrack === true ? structure.shopVisit : null,
    rideS: structure?.rideS ?? 0,
    hasTrack: structure?.hasTrack ?? false,
  });
  const facts = getWeatherSnapshot(db, walkId);
  const weather = facts === null ? {} : weatherDimensions(facts);

  const events = db.all(
    `SELECT type_id, reaction FROM event WHERE walk_id = ? AND deleted_at IS NULL`,
    [walkId],
  );
  const outcomes = walkOutcomes({
    events: events.length,
    hard: events.filter((e) => e['type_id'] === 'hard').length,
    success: events.filter((e) => e['type_id'] === 'success').length,
    reactions: events.flatMap((e) => (e['reaction'] === null ? [] : [Number(e['reaction'])])),
    summaryDone: Number(row['summary_pending'] ?? 0) === 0,
  });
  return { dims: compact({ ...dims, ...weather }), outcomes: compact({ ...outcomes }) };
}

export interface RefreshOptions {
  /** At most this many walks are worked out in one call; the rest wait for the next. Default 25. */
  readonly limit?: number;
  /** Try walks again whose last attempt failed, even if nothing changed. Default false. */
  readonly retryErrors?: boolean;
  /** For tests: replaces the work of a kind (to make it fail). */
  readonly hooks?: Partial<Record<DerivedKind, (walkId: string) => unknown>>;
}

export interface RefreshResult {
  /** Finished walks that take part. */
  readonly total: number;
  readonly computed: number;
  readonly skipped: number;
  readonly failed: number;
  /** Walks that were stale but left for the next call because of the limit. */
  readonly remaining: number;
}

interface StoredRow {
  readonly version: number;
  readonly fingerprint: string;
  readonly status: string;
}

function storedRows(db: SqlDb, walkId: string): Map<DerivedKind, StoredRow> {
  return new Map(
    db
      .all('SELECT kind, algo_version, fingerprint, status FROM walk_derived WHERE walk_id = ?', [
        walkId,
      ])
      .map((r) => [
        String(r['kind']) as DerivedKind,
        {
          version: Number(r['algo_version']),
          fingerprint: String(r['fingerprint']),
          status: String(r['status']),
        },
      ]),
  );
}

function needsWork(stored: Map<DerivedKind, StoredRow>, fp: string, retryErrors: boolean): boolean {
  return KINDS.some((kind) => {
    const row = stored.get(kind);
    if (row?.version !== DERIVED_VERSIONS[kind] || row.fingerprint !== fp) {
      return true;
    }
    return row.status === 'error' && retryErrors;
  });
}

function write(
  db: SqlDb,
  walkId: string,
  kind: DerivedKind,
  fp: string,
  now: number,
  result: { ok: true; json: unknown } | { ok: false; error: string },
): void {
  db.run(
    `INSERT OR REPLACE INTO walk_derived (walk_id, kind, algo_version, fingerprint, status, json, error, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      walkId,
      kind,
      DERIVED_VERSIONS[kind],
      fp,
      result.ok ? 'ok' : 'error',
      result.ok ? JSON.stringify(result.json) : null,
      result.ok ? null : result.error.slice(0, 300),
      toIso(now),
    ],
  );
}

/**
 * Works out the derived data of the finished walks of a dog that is missing or stale, newest
 * first, a few at a time. Safe to call at any moment and as often as wanted: a walk that is up to
 * date costs one fingerprint; a failure is recorded and never thrown.
 */
export function refreshDerived(
  db: SqlDb,
  ctx: Ctx,
  dogId: string,
  options: RefreshOptions = {},
): RefreshResult {
  const limit = options.limit ?? 25;
  const now = ctx.now();
  const walkIds = db
    .all(
      `SELECT w.id FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND ${LONG_ENOUGH}
        ORDER BY w.started_at DESC`,
      [dogId],
    )
    .map((r) => String(r['id']));
  let computed = 0;
  let skipped = 0;
  let failed = 0;
  let remaining = 0;
  for (const walkId of walkIds) {
    const fp = fingerprint(db, walkId);
    if (!needsWork(storedRows(db, walkId), fp, options.retryErrors === true)) {
      skipped += 1;
      continue;
    }
    if (computed + failed >= limit) {
      remaining += 1;
      continue;
    }
    const broke = db.transaction(() => {
      let broken = false;
      let structure: StructureJson | null = null;
      try {
        const hook = options.hooks?.structure;
        structure =
          hook === undefined ? computeStructure(db, walkId, now) : (hook(walkId) as StructureJson);
        write(db, walkId, 'structure', fp, now, { ok: true, json: structure });
      } catch (error) {
        broken = true;
        write(db, walkId, 'structure', fp, now, { ok: false, error: String(error) });
      }
      try {
        const hook = options.hooks?.dims;
        const dims =
          hook === undefined ? computeDims(db, walkId, structure) : (hook(walkId) as DimsJson);
        write(db, walkId, 'dims', fp, now, { ok: true, json: dims });
      } catch (error) {
        broken = true;
        write(db, walkId, 'dims', fp, now, { ok: false, error: String(error) });
      }
      return broken;
    });
    if (broke) {
      failed += 1;
    } else {
      computed += 1;
    }
  }
  return { total: walkIds.length, computed, skipped, failed, remaining };
}

export interface DerivedHealth {
  readonly walks: number;
  /** Walks whose derived rows are all current. */
  readonly current: number;
  readonly stale: number;
  readonly errors: number;
}

/** How much of the derived layer is up to date: for the diagnostics and the "still counting" note. */
export function derivedHealth(db: SqlDb, dogId: string): DerivedHealth {
  const walkIds = db
    .all(
      `SELECT w.id FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND ${LONG_ENOUGH}`,
      [dogId],
    )
    .map((r) => String(r['id']));
  let current = 0;
  let errors = 0;
  for (const walkId of walkIds) {
    const stored = storedRows(db, walkId);
    const fp = fingerprint(db, walkId);
    const stale = needsWork(stored, fp, false);
    if (stale) {
      continue;
    }
    if (KINDS.some((k) => stored.get(k)?.status === 'error')) {
      errors += 1;
    } else {
      current += 1;
    }
  }
  return { walks: walkIds.length, current, stale: walkIds.length - current - errors, errors };
}

/** Drops every derived row (they come back by themselves): the "recount everything" switch. */
export function clearDerived(db: SqlDb, dogId: string): number {
  return db.run(
    'DELETE FROM walk_derived WHERE walk_id IN (SELECT walk_id FROM walk_dog WHERE dog_id = ?)',
    [dogId],
  ).changes;
}

export interface StoredDims {
  readonly walkId: string;
  readonly startedAt: number;
  readonly dims: DimsJson;
}

/** The current, successfully worked-out dimensions of the finished walks of a dog, oldest first. */
export function listWalkDims(
  db: SqlDb,
  dogId: string,
  options: { readonly sinceTs?: number } = {},
): StoredDims[] {
  return db
    .all(
      `SELECT w.id, w.started_at, x.json
         FROM walk w
         JOIN walk_dog d ON d.walk_id = w.id
         JOIN walk_derived x ON x.walk_id = w.id AND x.kind = 'dims'
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND ${LONG_ENOUGH}
          AND x.status = 'ok' AND x.algo_version = ? AND w.started_at >= ?
        ORDER BY w.started_at, w.id`,
      [dogId, DERIVED_VERSIONS.dims, toIso(options.sinceTs ?? 0)],
    )
    .flatMap((r) => {
      try {
        return [
          {
            walkId: String(r['id']),
            startedAt: Date.parse(String(r['started_at'])),
            dims: JSON.parse(String(r['json'])) as DimsJson,
          },
        ];
      } catch {
        return []; // an unreadable row is a gap, not a crash
      }
    });
}
