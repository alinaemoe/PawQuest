import {
  localDay,
  placeSummary,
  placeWeeks,
  type PlaceSummary,
  type PlaceWalk,
  type PlaceWeek,
} from '@pawquest/insights';

import { MIN_ANALYSED_WALK_S } from './derived';
import { fromIso } from './ids';
import { listPlaces, type PlaceCategory } from './places';
import type { SqlDb } from './sql';

export interface PlaceActivity {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly summary: PlaceSummary;
  /** The last twelve weeks, the week of today last. */
  readonly weeks: readonly PlaceWeek[];
}

/**
 * The places a dog walked in, with a summary and the last twelve weeks of each, the most visited
 * first (docs/23, step 3.13). Walks shorter than two minutes are no walks; a walk counts for the
 * place it was assigned to.
 */
export function placeActivity(
  db: SqlDb,
  dogId: string,
  now: number,
  tzOffsetMin: number,
): PlaceActivity[] {
  const rows = db.all(
    `SELECT w.id, w.place_id, w.started_at, w.tz_offset_min, w.duration_s,
            (SELECT COUNT(*) FROM event e WHERE e.walk_id = w.id AND e.deleted_at IS NULL) AS events
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND w.place_id IS NOT NULL AND (w.duration_s IS NULL OR w.duration_s >= ?)
      ORDER BY w.started_at, w.id`,
    [dogId, MIN_ANALYSED_WALK_S],
  );
  const byPlace = new Map<string, PlaceWalk[]>();
  for (const r of rows) {
    const key = String(r['place_id']);
    const list = byPlace.get(key) ?? [];
    list.push({
      startedAt: fromIso(String(r['started_at'])),
      tzOffsetMin: Number(r['tz_offset_min']),
      durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
      events: Number(r['events']),
    });
    byPlace.set(key, list);
  }
  const today = localDay(now, tzOffsetMin);
  return listPlaces(db)
    .flatMap((place) => {
      const walks = byPlace.get(place.id);
      return walks === undefined
        ? []
        : [
            {
              placeId: place.id,
              name: place.name,
              category: place.category,
              summary: placeSummary(walks),
              weeks: placeWeeks(walks, today, 12),
            },
          ];
    })
    .sort(
      (a, b) =>
        b.summary.walks - a.summary.walks || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0),
    );
}
