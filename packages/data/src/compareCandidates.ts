import { effectivePlaceIds } from './walkPlace';
import { listPlaces } from './places';
import type { SqlDb } from './sql';

/** The walks a replay can be put beside (docs/23, step 3.20): finished, with a track, not the walk itself. */

export interface CompareCandidate {
  readonly walkId: string;
  readonly startedAt: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  /** The place of the walk (picked, or the one the track says), or null. */
  readonly placeName: string | null;
  /** The same place as the walk it is compared with: these come first. */
  readonly samePlace: boolean;
}

export const MAX_CANDIDATES = 40;

/**
 * The other walks of the dog that have a track: the walks in the same place first (the ones that
 * can really be compared), then the rest, each group newest first.
 */
export function compareCandidates(db: SqlDb, dogId: string, walkId: string): CompareCandidate[] {
  const rows = db.all(
    `SELECT w.id, w.started_at, w.duration_s, w.distance_m
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND w.id <> ?
        AND (SELECT COUNT(*) FROM track_point t WHERE t.walk_id = w.id AND t.excluded = 0) >= 2
      ORDER BY w.started_at DESC`,
    [dogId, walkId],
  );
  const places = effectivePlaceIds(db, dogId);
  const names = new Map(listPlaces(db).map((p) => [p.id, p.name]));
  const mine = places.get(walkId);
  const all = rows.map((r): CompareCandidate => {
    const id = String(r['id']);
    const placeId = places.get(id);
    return {
      walkId: id,
      startedAt: Date.parse(String(r['started_at'])),
      durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
      distanceM: r['distance_m'] === null ? null : Number(r['distance_m']),
      placeName: placeId === undefined ? null : (names.get(placeId) ?? null),
      samePlace: mine !== undefined && placeId === mine,
    };
  });
  return [...all.filter((c) => c.samePlace), ...all.filter((c) => !c.samePlace)].slice(
    0,
    MAX_CANDIDATES,
  );
}
