import { fromIso, toIso } from './ids';
import { listAlbum, type AlbumPhoto } from './photos';
import type { SqlDb } from './sql';
import { listWalks, walkTotals, type Walk, type WalkTotals } from './walks';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** The calm stretch must last at least this long to be worth mentioning. */
export const MIN_CALM_MS = 5 * 60_000;

/** Monday 00:00 (local time) of the week that contains `now`, and the next Monday. */
export function weekBounds(now: number, tzOffsetMin: number): { from: number; to: number } {
  const shift = tzOffsetMin * 60_000;
  const local = now + shift;
  const dayStart = local - (((local % DAY) + DAY) % DAY);
  // 1970-01-01 was a Thursday: days since then, shifted so that Monday is 0
  const weekday = (((Math.floor(dayStart / DAY) + 3) % 7) + 7) % 7;
  const from = dayStart - weekday * DAY - shift;
  return { from, to: from + WEEK };
}

export interface CalmMoment {
  readonly walkId: string;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface WeekRecap {
  readonly from: number;
  readonly to: number;
  readonly totals: WalkTotals;
  readonly previous: WalkTotals;
  readonly longest: Walk | null;
  /** The longest time inside a walk without a hard moment. */
  readonly calm: CalmMoment | null;
  readonly hardCount: number;
  readonly successCount: number;
  /** The first picture of the week, or null. */
  readonly photo: AlbumPhoto | null;
  readonly photoCount: number;
}

function walkEnd(walk: Walk): number {
  return walk.endedAt ?? walk.startedAt + (walk.durationS ?? 0) * 1000;
}

/** The longest stretch of a walk between its start, its hard moments and its end. */
export function calmestOf(db: SqlDb, walk: Walk): CalmMoment | null {
  const hard = db
    .all(
      `SELECT ts FROM event WHERE walk_id = ? AND type_id = 'hard' AND deleted_at IS NULL ORDER BY ts`,
      [walk.id],
    )
    .map((row) => fromIso(String(row['ts'])));
  const edges = [walk.startedAt, ...hard, walkEnd(walk)];
  let best: CalmMoment | null = null;
  for (let i = 1; i < edges.length; i += 1) {
    const from = edges[i - 1] ?? walk.startedAt;
    const length = (edges[i] ?? from) - from;
    if (length >= MIN_CALM_MS && (best === null || length > best.durationMs)) {
      best = { walkId: walk.id, startedAt: from, durationMs: length };
    }
  }
  return best;
}

function countEvents(db: SqlDb, dogId: string, typeId: string, from: number, to: number): number {
  const row = db.all(
    `SELECT COUNT(*) AS n FROM event
      WHERE dog_id = ? AND type_id = ? AND deleted_at IS NULL AND ts >= ? AND ts < ?`,
    [dogId, typeId, toIso(from), toIso(to)],
  )[0];
  return Number(row?.['n'] ?? 0);
}

/** The week of walks as one card: numbers against the week before, the calmest stretch, a picture. */
export function weekRecap(db: SqlDb, dogId: string, from: number, to: number): WeekRecap {
  const walks = listWalks(db, dogId, from, to);
  let longest: Walk | null = null;
  let calm: CalmMoment | null = null;
  for (const walk of walks) {
    if (longest === null || (walk.durationS ?? 0) > (longest.durationS ?? 0)) {
      longest = walk;
    }
    const candidate = calmestOf(db, walk);
    if (candidate !== null && (calm === null || candidate.durationMs > calm.durationMs)) {
      calm = candidate;
    }
  }
  const photos = listAlbum(db, dogId)
    .filter((p) => p.takenAt >= from && p.takenAt < to)
    .sort((a, b) => a.takenAt - b.takenAt);
  return {
    from,
    to,
    totals: walkTotals(db, dogId, from, to),
    previous: walkTotals(db, dogId, from - WEEK, from),
    longest,
    calm,
    hardCount: countEvents(db, dogId, 'hard', from, to),
    successCount: countEvents(db, dogId, 'success', from, to),
    photo: photos[0] ?? null,
    photoCount: photos.length,
  };
}
