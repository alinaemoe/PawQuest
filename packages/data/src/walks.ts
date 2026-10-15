import { expectFound, fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow, SqlValue } from './sql';

export interface Walk {
  readonly id: string;
  readonly title: string | null;
  readonly status: 'active' | 'paused' | 'completed' | 'discarded';
  readonly mode: 'gps' | 'no_gps' | 'manual' | 'imported';
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly placeKind: string | null;
  readonly mood: number | null;
  readonly distraction: number | null;
  readonly notes: string | null;
}

export interface ManualWalkInput {
  readonly dogId: string;
  readonly startedAt: number;
  readonly durationS: number;
  readonly tzOffsetMin?: number;
  readonly distanceM?: number | null;
  readonly title?: string | null;
  readonly placeKind?: string | null;
  readonly mood?: number | null;
  readonly distraction?: number | null;
  readonly notes?: string | null;
  readonly isDemo?: boolean;
}

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);

function toWalk(row: SqlRow): Walk {
  const ended = str(row['ended_at']);
  return {
    id: String(row['id']),
    title: str(row['title']),
    status: String(row['status']) as Walk['status'],
    mode: String(row['mode']) as Walk['mode'],
    startedAt: fromIso(String(row['started_at'])),
    endedAt: ended === null ? null : fromIso(ended),
    durationS: num(row['duration_s']),
    distanceM: num(row['distance_m']),
    placeKind: str(row['place_kind']),
    mood: num(row['mood']),
    distraction: num(row['distraction']),
    notes: str(row['notes']),
  };
}

/**
 * A walk written by hand (no GPS): mode `manual`, already completed. Marked `summary_pending` so
 * the app can offer to complete the details later (G-18: nothing is required).
 */
export function createManualWalk(db: SqlDb, ctx: Ctx, input: ManualWalkInput): Walk {
  if (!Number.isFinite(input.durationS) || input.durationS < 0) {
    throw new Error('Walk duration must be zero or more seconds');
  }
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.transaction(() => {
    db.run(
      `INSERT INTO walk
         (id, title, status, mode, started_at, ended_at, tz_offset_min, duration_s, distance_m,
          place_kind, mood, distraction, notes, summary_pending, is_demo, created_at, updated_at)
       VALUES (?, ?, 'completed', 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        input.title ?? null,
        toIso(input.startedAt),
        toIso(input.startedAt + input.durationS * 1000),
        input.tzOffsetMin ?? 0,
        Math.round(input.durationS),
        input.distanceM ?? null,
        input.placeKind ?? null,
        input.mood ?? null,
        input.distraction ?? null,
        input.notes ?? null,
        input.isDemo === true ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );
    db.run('INSERT INTO walk_dog (walk_id, dog_id) VALUES (?, ?)', [id, input.dogId]);
  });
  return expectFound(getWalk(db, id), 'walk');
}

export function getWalk(db: SqlDb, id: string): Walk | null {
  const row = db.all('SELECT * FROM walk WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toWalk(row);
}

/** The most recent finished walk of a dog, or null. */
export function lastCompletedWalk(db: SqlDb, dogId: string): Walk | null {
  const row = db.all(
    `SELECT w.* FROM walk w JOIN walk_dog d ON d.walk_id = w.id
     WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
     ORDER BY w.started_at DESC LIMIT 1`,
    [dogId],
  )[0];
  return row === undefined ? null : toWalk(row);
}

/** Finished walks of a dog that started between two moments, newest first. */
export function listWalks(db: SqlDb, dogId: string, fromTs: number, toTs: number): Walk[] {
  return db
    .all(
      `SELECT w.* FROM walk w JOIN walk_dog d ON d.walk_id = w.id
       WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
         AND w.started_at >= ? AND w.started_at < ?
       ORDER BY w.started_at DESC, w.id DESC`,
      [dogId, toIso(fromTs), toIso(toTs)],
    )
    .map(toWalk);
}
