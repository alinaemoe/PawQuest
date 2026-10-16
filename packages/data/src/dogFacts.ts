import { computeFacts, timeOfDayOf, type FactWalk, type Facts } from '@pawquest/insights';

import { calmestOf } from './recap';
import type { SqlDb } from './sql';
import { getWalk } from './walks';

/**
 * Facts and records of a dog (docs/23, step 3.4): plain counts over the finished walks, none of
 * them inferred. Walks that were removed are not counted. Read straight from the facts, so it is
 * right even while the derived layer is still being worked out.
 */
export function dogFacts(db: SqlDb, dogId: string, now: number, tzOffsetMin: number): Facts {
  const rows = db.all(
    `SELECT w.id, w.tz_offset_min, w.place_id
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
      ORDER BY w.started_at, w.id`,
    [dogId],
  );
  const walks: FactWalk[] = rows.flatMap((row) => {
    const walk = getWalk(db, String(row['id']));
    if (walk === null) {
      return [];
    }
    const tz = Number(row['tz_offset_min'] ?? 0);
    return [
      {
        id: walk.id,
        startedAt: walk.startedAt,
        tzOffsetMin: tz,
        durationS: walk.durationS,
        distanceM: walk.distanceM,
        placeId: row['place_id'] === null ? null : String(row['place_id']),
        timeOfDay: timeOfDayOf(walk.startedAt, tz),
        calmMs: calmestOf(db, walk)?.durationMs ?? null,
      },
    ];
  });
  return computeFacts(walks, now, tzOffsetMin);
}
