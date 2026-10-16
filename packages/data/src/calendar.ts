import { calendarWeeks, localDay, type CalendarWalk, type CalendarWeek } from '@pawquest/insights';

import { MIN_ANALYSED_WALK_S } from './derived';
import { fromIso, toIso } from './ids';
import { listAlbum, photosOnThisDay, type AlbumPhoto } from './photos';
import type { SqlDb } from './sql';

const DAY = 86_400_000;

interface WalkRow {
  readonly id: string;
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
}

function walkRows(db: SqlDb, dogId: string, fromTs: number, toTs: number): WalkRow[] {
  return db
    .all(
      `SELECT w.id, w.started_at, w.tz_offset_min, w.duration_s, w.distance_m
         FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
          AND (w.duration_s IS NULL OR w.duration_s >= ?)
          AND w.started_at >= ? AND w.started_at < ?
        ORDER BY w.started_at, w.id`,
      [dogId, MIN_ANALYSED_WALK_S, toIso(fromTs), toIso(toTs)],
    )
    .map((r) => ({
      id: String(r['id']),
      startedAt: fromIso(String(r['started_at'])),
      tzOffsetMin: Number(r['tz_offset_min'] ?? 0),
      durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
      distanceM: r['distance_m'] === null ? null : Number(r['distance_m']),
    }));
}

/**
 * The calendar of the last `weeks` weeks (docs/23, step 3.8): a cell per day coloured by the time
 * walked, Monday-first rows, the week of `now` last. `tzOffsetMin` gives "today".
 */
export function walkCalendar(
  db: SqlDb,
  dogId: string,
  now: number,
  tzOffsetMin: number,
  weeks = 12,
): CalendarWeek[] {
  const today = localDay(now, tzOffsetMin);
  const from = (today - weeks * 7 - 7) * DAY;
  const walks: CalendarWalk[] = walkRows(db, dogId, from, now + 2 * DAY).map((w) => ({
    startedAt: w.startedAt,
    tzOffsetMin: w.tzOffsetMin,
    durationS: w.durationS,
    distanceM: w.distanceM,
  }));
  return calendarWeeks(walks, today, weeks);
}

export interface DayWalk {
  readonly id: string;
  readonly startedAt: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
}

/** The walks of one local day, in the order they were taken (what a tap on a calendar cell opens). */
export function dayWalks(db: SqlDb, dogId: string, day: number): DayWalk[] {
  return walkRows(db, dogId, (day - 1) * DAY, (day + 2) * DAY)
    .filter((w) => localDay(w.startedAt, w.tzOffsetMin) === day)
    .map(({ id, startedAt, durationS, distanceM }) => ({ id, startedAt, durationS, distanceM }));
}

export interface Memory {
  /** How many years ago the day was. */
  readonly yearsAgo: number;
  readonly walks: readonly DayWalk[];
  readonly photos: readonly AlbumPhoto[];
}

/**
 * "On this day": the walks and pictures of today's date in earlier years, the nearest year first.
 * Only years in which something happened.
 */
export function onThisDay(db: SqlDb, dogId: string, now: number, tzOffsetMin: number): Memory[] {
  const shift = tzOffsetMin * 60_000;
  const today = new Date(now + shift);
  const month = today.getUTCMonth();
  const date = today.getUTCDate();
  const year = today.getUTCFullYear();
  const years = new Map<number, { walks: DayWalk[]; photos: AlbumPhoto[] }>();
  const entry = (yearsAgo: number) => {
    const found = years.get(yearsAgo) ?? { walks: [], photos: [] };
    years.set(yearsAgo, found);
    return found;
  };
  for (const w of walkRows(db, dogId, 0, now)) {
    const local = new Date(w.startedAt + w.tzOffsetMin * 60_000);
    const yearsAgo = year - local.getUTCFullYear();
    if (yearsAgo > 0 && local.getUTCMonth() === month && local.getUTCDate() === date) {
      entry(yearsAgo).walks.push({
        id: w.id,
        startedAt: w.startedAt,
        durationS: w.durationS,
        distanceM: w.distanceM,
      });
    }
  }
  for (const group of photosOnThisDay(listAlbum(db, dogId), now, tzOffsetMin)) {
    entry(group.yearsAgo).photos.push(...group.photos);
  }
  return [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([yearsAgo, found]) => ({ yearsAgo, walks: found.walks, photos: found.photos }));
}
