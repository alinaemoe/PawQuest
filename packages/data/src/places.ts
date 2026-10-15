import {
  defaultPlaceName,
  findDuplicates,
  haversineDistanceM,
  isValidLatLon,
  nameKey,
  tidyName,
  type DuplicateCandidate,
  type LatLon,
} from '@pawquest/core';

import { expectFound, fromIso, toIso, type Ctx } from './ids';

function mustGet(db: SqlDb, id: string): Place {
  const place = getPlace(db, id);
  if (place === null) {
    throw new Error('Place not found');
  }
  return place;
}
import type { SqlDb, SqlRow, SqlValue } from './sql';

/** In the order shown to the owner: big green places first, errands and bases after, "other" last. */
export const PLACE_CATEGORIES = [
  'park',
  'forest',
  'waterfront',
  'square',
  'meadow',
  'alley',
  'yard',
  'dog_area',
  'district',
  'quiet_street',
  'busy_street',
  'shop',
  'vet',
  'grooming',
  'home',
  'guests',
  'other',
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly lat: number;
  readonly lon: number;
  readonly radiusM: number;
  readonly notes: string | null;
}

export interface PlaceStats extends Place {
  /** Completed walks that happened here. */
  readonly visits: number;
  readonly lastVisitAt: number | null;
}

export interface CreatePlaceInput {
  readonly category: PlaceCategory;
  /** Typed by the owner; tidied, and replaced by `label` (numbered if taken) when empty. */
  readonly name?: string;
  /** The type's display name, the fallback when no name is typed ("Луг", then "Луг 2"). */
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
  readonly radiusM?: number;
  readonly notes?: string | null;
  readonly isDemo?: boolean;
}

/**
 * How far a place reaches by default, by type (D-62): a park is hundreds of meters across, a
 * clearing or a yard tens. The owner can change it; a map outline can replace it later.
 */
export const PLACE_DEFAULT_RADIUS_M: Readonly<Record<PlaceCategory, number>> = {
  park: 300,
  forest: 250,
  district: 400,
  waterfront: 120,
  meadow: 50,
  yard: 40,
  dog_area: 40,
  quiet_street: 40,
  busy_street: 40,
  vet: 40,
  other: 60,
  square: 80,
  alley: 40,
  shop: 40,
  grooming: 40,
  home: 40,
  guests: 40,
};
/** Places where the owner and dog go indoors for long: a walk ends and begins there (D-62). */
export function isBasePlace(category: PlaceCategory): boolean {
  return category === 'home' || category === 'guests';
}

export const MIN_PLACE_RADIUS_M = 15;
export const MAX_PLACE_RADIUS_M = 1000;
/** A grid cell of about 55 m instead of a geohash (D-51); only used to find neighbours quickly. */
const CELL_DEG = 0.0005;

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);

function cell(lat: number, lon: number): string {
  return `${String(Math.floor(lat / CELL_DEG))}:${String(Math.floor(lon / CELL_DEG))}`;
}

function toPlace(row: SqlRow): Place {
  return {
    id: String(row['id']),
    name: String(row['name']),
    category: String(row['category']) as PlaceCategory,
    lat: Number(row['lat']),
    lon: Number(row['lon']),
    radiusM: Number(row['radius_m']),
    notes: str(row['notes']),
  };
}

function clampRadius(radius: number): number {
  return Math.min(MAX_PLACE_RADIUS_M, Math.max(MIN_PLACE_RADIUS_M, Math.round(radius)));
}

/** Saves a place. The name is tidied (A-24); with no usable name it becomes the type label. */
export function createPlace(db: SqlDb, ctx: Ctx, input: CreatePlaceInput): Place {
  if (!isValidLatLon(input)) {
    throw new RangeError('Place needs a valid position');
  }
  const typed = tidyName(input.name ?? '');
  const name =
    typed === ''
      ? defaultPlaceName(
          input.label,
          db.all('SELECT name FROM place WHERE deleted_at IS NULL').map((r) => String(r['name'])),
        )
      : typed;
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO place (id, name, category, name_norm, lat, lon, radius_m, geohash8, notes, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      input.category,
      nameKey(name),
      input.lat,
      input.lon,
      clampRadius(input.radiusM ?? PLACE_DEFAULT_RADIUS_M[input.category]),
      cell(input.lat, input.lon),
      input.notes ?? null,
      input.isDemo === true ? 1 : 0,
      nowIso,
      nowIso,
    ],
  );
  return expectFound(getPlace(db, id), 'place');
}

export function getPlace(db: SqlDb, id: string): Place | null {
  const row = db.all('SELECT * FROM place WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toPlace(row);
}

/** All saved places with their visit counts, most visited first, then the most recent. */
export function listPlaces(db: SqlDb): PlaceStats[] {
  const rows = db.all(
    `SELECT p.*, COUNT(w.id) AS visits, MAX(w.started_at) AS last_visit
       FROM place p
       LEFT JOIN walk w ON w.place_id = p.id AND w.deleted_at IS NULL AND w.status = 'completed'
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY visits DESC, last_visit DESC, p.name`,
  );
  return rows.map((row) => {
    const last = str(row['last_visit']);
    return {
      ...toPlace(row),
      visits: Number(row['visits']),
      lastVisitAt: last === null ? null : fromIso(last),
    };
  });
}

/** The few places to offer as chips in the pre-walk sheet: most visited, then most recent. */
export function topPlaces(db: SqlDb, limit = 4): PlaceStats[] {
  return listPlaces(db).slice(0, limit);
}

/**
 * The saved place the position is in (inside its radius, at least 40 m), the nearest one when
 * several overlap; the pre-walk sheet offers it as "Парк у дома?".
 */
export function placeAt(db: SqlDb, at: LatLon): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const row of db.all('SELECT * FROM place WHERE deleted_at IS NULL')) {
    const place = toPlace(row);
    const distance = haversineDistanceM(at, place);
    if (distance <= Math.max(place.radiusM, 40) && (best === null || distance < best.distance)) {
      best = { place, distance };
    }
  }
  return best?.place ?? null;
}

export interface PlacePatch {
  readonly name?: string;
  readonly category?: PlaceCategory;
  readonly radiusM?: number;
  readonly notes?: string | null;
}

/** Renames or retypes a place. The old name stays as an alias, so typing it again finds the place. */
export function updatePlace(db: SqlDb, ctx: Ctx, id: string, patch: PlacePatch): Place {
  const current = mustGet(db, id);
  const name = patch.name === undefined ? current.name : tidyName(patch.name) || current.name;
  db.run(
    `UPDATE place SET name = ?, name_norm = ?, category = ?, radius_m = ?, notes = ?, updated_at = ?
      WHERE id = ?`,
    [
      name,
      nameKey(name),
      patch.category ?? current.category,
      clampRadius(patch.radiusM ?? current.radiusM),
      patch.notes === undefined ? current.notes : patch.notes,
      toIso(ctx.now()),
      id,
    ],
  );
  if (name !== current.name) {
    addAlias(db, ctx, id, current.name);
  }
  return expectFound(getPlace(db, id), 'place');
}

/** Remembers that this text means this place (A-24); a text that is the name itself is skipped. */
export function addAlias(db: SqlDb, ctx: Ctx, placeId: string, rawName: string): void {
  const key = nameKey(rawName);
  const place = getPlace(db, placeId);
  if (key === '' || place === null || key === nameKey(place.name)) {
    return;
  }
  db.run('INSERT OR REPLACE INTO place_alias (alias_norm, place_id, created_at) VALUES (?, ?, ?)', [
    key,
    placeId,
    toIso(ctx.now()),
  ]);
}

export interface PlaceMatch {
  readonly place: Place;
  readonly score: number;
  readonly reason: DuplicateCandidate['reason'];
}

/** Saved places a typed name (and position) probably refers to: "Похоже на «Парк у дома»". */
export function findSimilarPlaces(
  db: SqlDb,
  rawName: string,
  options: { readonly category?: PlaceCategory | null; readonly point?: LatLon } = {},
): PlaceMatch[] {
  const places = db.all('SELECT * FROM place WHERE deleted_at IS NULL').map(toPlace);
  const aliases = new Map<string, string[]>();
  for (const row of db.all('SELECT alias_norm, place_id FROM place_alias')) {
    const list = aliases.get(String(row['place_id'])) ?? [];
    list.push(String(row['alias_norm']));
    aliases.set(String(row['place_id']), list);
  }
  const byId = new Map(places.map((p) => [p.id, p]));
  const library = places.map((p) => ({
    id: p.id,
    nameNorm: nameKey(p.name),
    category: p.category,
    lat: p.lat,
    lon: p.lon,
    radiusM: p.radiusM,
    aliases: aliases.get(p.id) ?? [],
  }));
  return findDuplicates(rawName, library, {
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.point === undefined ? {} : { point: options.point }),
  }).flatMap((c) => {
    const place = byId.get(c.id);
    return place === undefined ? [] : [{ place, score: c.score, reason: c.reason }];
  });
}

/** Pairs of saved places that look like the same place, for the "Навести порядок" block. */
export function similarPlacePairs(db: SqlDb): { readonly keep: Place; readonly other: Place }[] {
  const places = listPlaces(db);
  const pairs: { keep: Place; other: Place }[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    const matches = findSimilarPlaces(db, place.name, {
      category: place.category,
      point: place,
    }).filter((m) => m.place.id !== place.id && m.reason !== 'alias');
    for (const match of matches) {
      const key = [place.id, match.place.id].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        // the more visited one stays (the list is ordered by visits)
        pairs.push({ keep: place, other: match.place });
      }
    }
  }
  return pairs;
}

/** Points a walk at a saved place, or at only a type (or nothing). */
export function setWalkPlace(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  place: { readonly placeId: string | null; readonly placeKind: string | null },
): void {
  db.run('UPDATE walk SET place_id = ?, place_kind = ?, updated_at = ? WHERE id = ?', [
    place.placeId,
    place.placeKind,
    toIso(ctx.now()),
    walkId,
  ]);
}

export interface MergeRecord {
  readonly walkIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly sessionIds: readonly string[];
  /** Names the merged place was already known by, moved along with it. */
  readonly movedAliases: readonly string[];
  readonly aliasKey: string;
}

const REFERENCING = [
  ['walk', 'walkIds'],
  ['event', 'eventIds'],
  ['training_session', 'sessionIds'],
] as const;

/**
 * Merges `from` into `into`: its walks, events and sessions move over, its name becomes an alias,
 * and it goes to the trash. Returns what moved, so the toast's "Отменить" can put it all back.
 */
export function mergePlaces(db: SqlDb, ctx: Ctx, fromId: string, intoId: string): MergeRecord {
  if (fromId === intoId) {
    throw new Error('Cannot merge a place into itself');
  }
  const from = mustGet(db, fromId);
  mustGet(db, intoId);
  return db.transaction(() => {
    const moved: Record<'walkIds' | 'eventIds' | 'sessionIds', string[]> = {
      walkIds: [],
      eventIds: [],
      sessionIds: [],
    };
    const nowIso = toIso(ctx.now());
    for (const [table, key] of REFERENCING) {
      moved[key] = db
        .all(`SELECT id FROM ${table} WHERE place_id = ?`, [fromId])
        .map((r) => String(r['id']));
      db.run(`UPDATE ${table} SET place_id = ? WHERE place_id = ?`, [intoId, fromId]);
    }
    const movedAliases = db
      .all('SELECT alias_norm FROM place_alias WHERE place_id = ?', [fromId])
      .map((r) => String(r['alias_norm']));
    db.run('UPDATE place_alias SET place_id = ? WHERE place_id = ?', [intoId, fromId]);
    addAlias(db, ctx, intoId, from.name);
    db.run('UPDATE place SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      nowIso,
      nowIso,
      fromId,
    ]);
    return { ...moved, movedAliases, aliasKey: nameKey(from.name) };
  });
}

/** Undoes {@link mergePlaces}: restores the place, moves its records back, drops the new alias. */
export function undoMerge(
  db: SqlDb,
  ctx: Ctx,
  fromId: string,
  intoId: string,
  record: MergeRecord,
): void {
  db.transaction(() => {
    db.run('UPDATE place SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
      toIso(ctx.now()),
      fromId,
    ]);
    const lists = {
      walk: record.walkIds,
      event: record.eventIds,
      training_session: record.sessionIds,
    };
    for (const [table, ids] of Object.entries(lists)) {
      for (const id of ids) {
        db.run(`UPDATE ${table} SET place_id = ? WHERE id = ? AND place_id = ?`, [
          fromId,
          id,
          intoId,
        ]);
      }
    }
    db.run('DELETE FROM place_alias WHERE alias_norm = ? AND place_id = ?', [
      record.aliasKey,
      intoId,
    ]);
    for (const key of record.movedAliases) {
      db.run('UPDATE place_alias SET place_id = ? WHERE alias_norm = ?', [fromId, key]);
    }
  });
}
