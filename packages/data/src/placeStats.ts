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
import { effectivePlaceIds, structureZones } from './walkPlace';

export interface PlaceActivity {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly summary: PlaceSummary;
  /** The last twelve weeks, the week of today last. */
  readonly weeks: readonly PlaceWeek[];
  /** Time spent inside the place over all walks, by the zones (moving or not), seconds. */
  readonly dwellS: number;
  /** Events that happened while the owner was inside the place. */
  readonly zoneEvents: number;
  /**
   * Events per hour inside the place, or null when less than an hour was spent there: a rate from
   * twenty minutes is not a rate. Comparable between places only when both have a number.
   */
  readonly eventsPerHour: number | null;
}

/** The least time inside a place before an events-per-hour figure is given. */
export const MIN_RATE_DWELL_S = 3600;

/**
 * The places a dog walked in, with a summary and the last twelve weeks of each, the most visited
 * first (docs/23, steps 3.13 and 3.19). Walks shorter than two minutes are no walks; a walk counts
 * for the place the owner picked or, without one, the place it was mostly in (D-73). The time
 * inside a place and the events in it come from the zones of every walk, so the glade inside a
 * park is counted too.
 */
export function placeActivity(
  db: SqlDb,
  dogId: string,
  now: number,
  tzOffsetMin: number,
): PlaceActivity[] {
  const placeOf = effectivePlaceIds(db, dogId);
  const zones = structureZones(db, dogId);
  const rows = db.all(
    `SELECT w.id, w.started_at, w.tz_offset_min, w.duration_s,
            (SELECT COUNT(*) FROM event e WHERE e.walk_id = w.id AND e.deleted_at IS NULL) AS events
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND (w.duration_s IS NULL OR w.duration_s >= ?)
      ORDER BY w.started_at, w.id`,
    [dogId, MIN_ANALYSED_WALK_S],
  );
  const byPlace = new Map<string, PlaceWalk[]>();
  for (const r of rows) {
    const place = placeOf.get(String(r['id']));
    if (place === undefined) {
      continue;
    }
    const list = byPlace.get(place) ?? [];
    list.push({
      startedAt: fromIso(String(r['started_at'])),
      tzOffsetMin: Number(r['tz_offset_min']),
      durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
      events: Number(r['events']),
    });
    byPlace.set(place, list);
  }

  const eventTimes = new Map<string, number[]>();
  for (const r of db.all(
    'SELECT walk_id, ts FROM event WHERE dog_id = ? AND walk_id IS NOT NULL AND deleted_at IS NULL',
    [dogId],
  )) {
    const walkId = String(r['walk_id']);
    eventTimes.set(walkId, [...(eventTimes.get(walkId) ?? []), fromIso(String(r['ts']))]);
  }
  const dwell = new Map<string, { dwellS: number; events: number }>();
  for (const [walkId, found] of zones) {
    for (const z of found.zones) {
      const sum = dwell.get(z.placeId) ?? { dwellS: 0, events: 0 };
      sum.dwellS += z.dwellS;
      sum.events += (eventTimes.get(walkId) ?? []).filter(
        (t) => t >= z.fromTs && t <= z.toTs,
      ).length;
      dwell.set(z.placeId, sum);
    }
  }

  const today = localDay(now, tzOffsetMin);
  return listPlaces(db)
    .flatMap((place) => {
      const walks = byPlace.get(place.id);
      if (walks === undefined) {
        return [];
      }
      const inside = dwell.get(place.id) ?? { dwellS: 0, events: 0 };
      return [
        {
          placeId: place.id,
          name: place.name,
          category: place.category,
          summary: placeSummary(walks),
          weeks: placeWeeks(walks, today, 12),
          dwellS: inside.dwellS,
          zoneEvents: inside.events,
          eventsPerHour:
            inside.dwellS >= MIN_RATE_DWELL_S
              ? Math.round((inside.events / (inside.dwellS / 3600)) * 10) / 10
              : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.summary.walks - a.summary.walks || (b.summary.lastAt ?? 0) - (a.summary.lastAt ?? 0),
    );
}
