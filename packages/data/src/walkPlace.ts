import { DERIVED_VERSIONS, MIN_ANALYSED_WALK_S } from './derived';
import type { StructureJson } from './derived';
import type { SqlDb } from './sql';

/**
 * The place of a walk (D-73): the one the owner picked, else the one the walk was mostly in (the
 * zones worked out from its track). Everything that groups walks by place reads it from here, so a
 * walk nobody labelled still belongs to its park.
 */

export interface ZoneRow {
  readonly placeId: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly dwellS: number;
}

/** The zones and main place of the current structure rows, by walk. */
export function structureZones(
  db: SqlDb,
  dogId: string,
): Map<string, { zones: readonly ZoneRow[]; mainPlaceId: string | null }> {
  const out = new Map<string, { zones: readonly ZoneRow[]; mainPlaceId: string | null }>();
  for (const r of db.all(
    `SELECT x.walk_id, x.json FROM walk_derived x
       JOIN walk_dog d ON d.walk_id = x.walk_id
      WHERE d.dog_id = ? AND x.kind = 'structure' AND x.status = 'ok' AND x.algo_version = ?`,
    [dogId, DERIVED_VERSIONS.structure],
  )) {
    try {
      const json = JSON.parse(String(r['json'])) as StructureJson;
      out.set(String(r['walk_id']), {
        zones: json.zones ?? [],
        mainPlaceId: json.mainPlaceId ?? null,
      });
    } catch {
      // an unreadable row is a gap, not a crash
    }
  }
  return out;
}

/** The place of each finished walk of the dog: picked by the owner, else the main one. */
export function effectivePlaceIds(db: SqlDb, dogId: string): Map<string, string> {
  const zones = structureZones(db, dogId);
  const out = new Map<string, string>();
  for (const r of db.all(
    `SELECT w.id, w.place_id FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND (w.duration_s IS NULL OR w.duration_s >= ?)`,
    [dogId, MIN_ANALYSED_WALK_S],
  )) {
    const id = String(r['id']);
    const picked = r['place_id'] === null ? null : String(r['place_id']);
    const place = picked ?? zones.get(id)?.mainPlaceId ?? null;
    if (place !== null) {
      out.set(id, place);
    }
  }
  return out;
}
