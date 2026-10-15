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

export interface WalkTotals {
  readonly count: number;
  readonly durationS: number;
  readonly distanceM: number;
}

/** Number, total time and total distance of the finished walks that started in a range. */
export function walkTotals(db: SqlDb, dogId: string, fromTs: number, toTs: number): WalkTotals {
  const row = db.all(
    `SELECT COUNT(*) AS n, COALESCE(SUM(w.duration_s), 0) AS dur, COALESCE(SUM(w.distance_m), 0) AS dist
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND w.started_at >= ? AND w.started_at < ?`,
    [dogId, toIso(fromTs), toIso(toTs)],
  )[0];
  return {
    count: Number(row?.['n'] ?? 0),
    durationS: Number(row?.['dur'] ?? 0),
    distanceM: Number(row?.['dist'] ?? 0),
  };
}

/** One page of finished walks, newest first; `before` is the start time of the last row of the previous page. */
export function listWalksPage(db: SqlDb, dogId: string, limit: number, before?: number): Walk[] {
  return db
    .all(
      `SELECT w.* FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND w.started_at < ?
        ORDER BY w.started_at DESC, w.id DESC LIMIT ?`,
      [dogId, toIso(before ?? 8_000_000_000_000), limit],
    )
    .map(toWalk);
}

export interface WalkChanges {
  readonly title?: string | null;
  readonly notes?: string | null;
  readonly durationS?: number;
  readonly distanceM?: number | null;
  readonly mood?: number | null;
  readonly distraction?: number | null;
  readonly placeKind?: string | null;
  /** False once the owner has seen the summary ("можно дополнить" disappears). */
  readonly summaryPending?: boolean;
}

/** Edits a finished walk; changing the duration moves the end time, the start stays put. */
export function updateWalk(db: SqlDb, ctx: Ctx, id: string, changes: WalkChanges): Walk | null {
  const walk = getWalk(db, id);
  if (walk === null) {
    return null;
  }
  const sets: string[] = [];
  const params: SqlValue[] = [];
  const set = (column: string, value: SqlValue | undefined): void => {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(value);
    }
  };
  if (changes.durationS !== undefined) {
    if (!Number.isFinite(changes.durationS) || changes.durationS < 0) {
      throw new Error('Walk duration must be zero or more seconds');
    }
    set('duration_s', Math.round(changes.durationS));
    set('ended_at', toIso(walk.startedAt + changes.durationS * 1000));
  }
  set('title', changes.title);
  set('notes', changes.notes);
  set('distance_m', changes.distanceM);
  set('mood', changes.mood);
  set('distraction', changes.distraction);
  set('place_kind', changes.placeKind);
  set(
    'summary_pending',
    changes.summaryPending === undefined ? undefined : changes.summaryPending ? 1 : 0,
  );
  if (sets.length > 0) {
    db.run(
      `UPDATE walk SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [...params, toIso(ctx.now()), id],
    );
  }
  return getWalk(db, id);
}

/** Events recorded during a walk, in time order. */
export function walkEventIds(db: SqlDb, walkId: string): { typeId: string; ts: number }[] {
  return db
    .all('SELECT type_id, ts FROM event WHERE walk_id = ? AND deleted_at IS NULL ORDER BY ts', [
      walkId,
    ])
    .map((row) => ({ typeId: String(row['type_id']), ts: fromIso(String(row['ts'])) }));
}
