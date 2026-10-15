import { analyzeMotion, filterTrack, type GpsFix } from '@pawquest/core';

import { expectFound, fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow } from './sql';
import { getWalk, type Walk } from './walks';

/** One stored GPS fix of a walk. */
export interface TrackPointInput {
  readonly ts: number;
  readonly lat: number;
  readonly lon: number;
  readonly accuracyM?: number | null;
  readonly altitudeM?: number | null;
  readonly speedMps?: number | null;
}

export interface StartWalkInput {
  readonly dogId: string;
  readonly mode?: 'gps' | 'no_gps';
  readonly tzOffsetMin?: number;
  readonly placeId?: string | null;
  readonly placeKind?: string | null;
}

export interface WalkMetrics {
  readonly distanceM: number;
  readonly movingS: number;
  readonly pausedS: number;
}

type SegmentKind = 'moving' | 'paused' | 'gap';

function openSegment(db: SqlDb, ctx: Ctx, walkId: string, kind: SegmentKind, at: number): void {
  db.run('INSERT INTO walk_segment (id, walk_id, kind, started_at) VALUES (?, ?, ?, ?)', [
    ctx.newId(),
    walkId,
    kind,
    toIso(at),
  ]);
}

function closeOpenSegment(db: SqlDb, walkId: string, at: number): void {
  db.run('UPDATE walk_segment SET ended_at = ? WHERE walk_id = ? AND ended_at IS NULL', [
    toIso(at),
    walkId,
  ]);
}

function statusOf(db: SqlDb, walkId: string): string | null {
  const row = db.all('SELECT status FROM walk WHERE id = ? AND deleted_at IS NULL', [walkId])[0];
  return row === undefined ? null : String(row['status']);
}

/**
 * Starts a walk (spec 4.1: idle -> active). The walk row exists from this moment, so a crash
 * leaves something to recover. Only one walk can be running at a time.
 */
export function startWalk(db: SqlDb, ctx: Ctx, input: StartWalkInput): Walk {
  if (getActiveWalk(db, input.dogId) !== null) {
    throw new Error('A walk is already in progress');
  }
  const id = ctx.newId();
  const now = ctx.now();
  db.transaction(() => {
    db.run(
      `INSERT INTO walk (id, status, mode, started_at, tz_offset_min, place_id, place_kind, created_at, updated_at)
       VALUES (?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.mode ?? 'gps',
        toIso(now),
        input.tzOffsetMin ?? 0,
        input.placeId ?? null,
        input.placeKind ?? null,
        toIso(now),
        toIso(now),
      ],
    );
    db.run('INSERT INTO walk_dog (walk_id, dog_id) VALUES (?, ?)', [id, input.dogId]);
    openSegment(db, ctx, id, 'moving', now);
  });
  return expectFound(getWalk(db, id), 'walk');
}

/** The walk that is running or paused for a dog, if any. */
export function getActiveWalk(db: SqlDb, dogId: string): Walk | null {
  const row = db.all(
    `SELECT w.id FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status IN ('active', 'paused') AND w.deleted_at IS NULL
      ORDER BY w.started_at DESC LIMIT 1`,
    [dogId],
  )[0];
  return row === undefined ? null : getWalk(db, String(row['id']));
}

/** Pauses an active walk. False when it is not active. */
export function pauseWalk(db: SqlDb, ctx: Ctx, walkId: string): boolean {
  if (statusOf(db, walkId) !== 'active') {
    return false;
  }
  const now = ctx.now();
  db.transaction(() => {
    closeOpenSegment(db, walkId, now);
    openSegment(db, ctx, walkId, 'paused', now);
    db.run("UPDATE walk SET status = 'paused', updated_at = ? WHERE id = ?", [toIso(now), walkId]);
  });
  return true;
}

/** Continues a paused walk. False when it is not paused. */
export function resumeWalk(db: SqlDb, ctx: Ctx, walkId: string): boolean {
  if (statusOf(db, walkId) !== 'paused') {
    return false;
  }
  const now = ctx.now();
  db.transaction(() => {
    closeOpenSegment(db, walkId, now);
    openSegment(db, ctx, walkId, 'moving', now);
    db.run("UPDATE walk SET status = 'active', updated_at = ? WHERE id = ?", [toIso(now), walkId]);
  });
  return true;
}

/** Writes a batch of fixes in one transaction (spec 08 §8.5: 5 points or 5 seconds). */
export function appendTrackPoints(
  db: SqlDb,
  walkId: string,
  points: readonly TrackPointInput[],
): void {
  if (points.length === 0) {
    return;
  }
  db.transaction(() => {
    db.runMany(
      'INSERT INTO track_point (walk_id, ts, lat, lon, accuracy_m, altitude_m, speed_mps) VALUES (?, ?, ?, ?, ?, ?, ?)',
      points.map((p) => [
        walkId,
        toIso(p.ts),
        p.lat,
        p.lon,
        p.accuracyM ?? null,
        p.altitudeM ?? null,
        p.speedMps ?? null,
      ]),
    );
  });
}

function toFix(row: SqlRow): GpsFix {
  return {
    ts: fromIso(String(row['ts'])),
    lat: Number(row['lat']),
    lon: Number(row['lon']),
    ...(typeof row['accuracy_m'] === 'number' ? { accuracyM: row['accuracy_m'] } : {}),
    ...(typeof row['speed_mps'] === 'number' ? { speedMps: row['speed_mps'] } : {}),
  };
}

/** Stored fixes of a walk in time order, leaving out the ones the owner excluded. */
export function listTrackPoints(db: SqlDb, walkId: string): GpsFix[] {
  return db
    .all('SELECT * FROM track_point WHERE walk_id = ? AND excluded = 0 ORDER BY ts, id', [walkId])
    .map(toFix);
}

export function lastTrackPoint(db: SqlDb, walkId: string): GpsFix | null {
  const row = db.all(
    'SELECT * FROM track_point WHERE walk_id = ? AND excluded = 0 ORDER BY ts DESC, id DESC LIMIT 1',
    [walkId],
  )[0];
  return row === undefined ? null : toFix(row);
}

/**
 * Distance and time in motion of a walk, from its stored fixes and pauses (A-01, A-03). Fixes are
 * grouped by the moving segment they belong to and each group is filtered on its own, so the
 * straight line across a pause or a crash gap never adds distance.
 */
export function computeWalkMetrics(db: SqlDb, walkId: string, now: number): WalkMetrics {
  const rows = db.all(
    'SELECT kind, started_at, ended_at FROM walk_segment WHERE walk_id = ? ORDER BY started_at, rowid',
    [walkId],
  );
  const range = (row: SqlRow): { fromTs: number; toTs: number } => ({
    fromTs: fromIso(String(row['started_at'])),
    toTs: row['ended_at'] === null ? now : fromIso(String(row['ended_at'])),
  });
  const moving = rows.filter((r) => r['kind'] === 'moving').map(range);
  const paused = rows.filter((r) => r['kind'] === 'paused').map(range);
  const all = listTrackPoints(db, walkId);

  let distanceM = 0;
  let movingS = 0;
  // a walk written without segments (no GPS) has nothing to measure
  for (const segment of moving) {
    const fixes = all.filter((p) => p.ts >= segment.fromTs && p.ts <= segment.toTs);
    const filtered = filterTrack(fixes);
    distanceM += filtered.distanceM;
    movingS += analyzeMotion(filtered.points).movingS;
  }
  const pausedS = paused.reduce((sum, r) => sum + (r.toTs - r.fromTs) / 1000, 0);
  return { distanceM, movingS, pausedS };
}

/**
 * Ends a walk (spec 4.1: finishing -> completed): closes the open segment, fixes the totals and
 * marks it "can be completed" so Summary can offer the details. Returns the finished walk.
 */
export function finishWalk(db: SqlDb, ctx: Ctx, walkId: string, endedAt?: number): Walk {
  const status = statusOf(db, walkId);
  if (status !== 'active' && status !== 'paused') {
    throw new Error('Only a running walk can be finished');
  }
  const walk = expectFound(getWalk(db, walkId), 'walk');
  const end = endedAt ?? ctx.now();
  db.transaction(() => {
    closeOpenSegment(db, walkId, end);
    const metrics = computeWalkMetrics(db, walkId, end);
    db.run(
      `UPDATE walk SET status = 'completed', ended_at = ?, duration_s = ?, moving_s = ?, paused_s = ?,
              distance_m = ?, summary_pending = 1, updated_at = ?
        WHERE id = ?`,
      [
        toIso(end),
        Math.max(0, Math.round((end - walk.startedAt) / 1000)),
        Math.round(metrics.movingS),
        Math.round(metrics.pausedS),
        Math.round(metrics.distanceM),
        toIso(ctx.now()),
        walkId,
      ],
    );
  });
  return expectFound(getWalk(db, walkId), 'walk');
}

/** Throws a walk away (status `discarded`); its points stay until the trash is emptied. */
export function discardWalk(db: SqlDb, ctx: Ctx, walkId: string): boolean {
  const status = statusOf(db, walkId);
  if (status !== 'active' && status !== 'paused') {
    return false;
  }
  closeOpenSegment(db, walkId, ctx.now());
  db.run("UPDATE walk SET status = 'discarded', updated_at = ? WHERE id = ?", [
    toIso(ctx.now()),
    walkId,
  ]);
  return true;
}

export type RecoverAction = 'continue' | 'finish' | 'discard';

/**
 * What to do with a walk found running after the app was killed (spec 4.1): continue it, marking
 * the missing time as a gap in the track; finish it at the last recorded point; or discard it.
 */
export function recoverWalk(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  action: RecoverAction,
): Walk | null {
  const status = statusOf(db, walkId);
  if (status !== 'active' && status !== 'paused') {
    return null;
  }
  const walk = expectFound(getWalk(db, walkId), 'walk');
  const last = lastTrackPoint(db, walkId);
  if (action === 'discard') {
    discardWalk(db, ctx, walkId);
    return null;
  }
  if (action === 'finish') {
    return finishWalk(db, ctx, walkId, last?.ts ?? walk.startedAt);
  }
  const now = ctx.now();
  db.transaction(() => {
    closeOpenSegment(db, walkId, now);
    if (last !== null && now - last.ts > 30_000) {
      db.run(
        'INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
        [ctx.newId(), walkId, 'gap', toIso(last.ts), toIso(now)],
      );
    }
    openSegment(db, ctx, walkId, 'moving', now);
    db.run("UPDATE walk SET status = 'active', updated_at = ? WHERE id = ?", [toIso(now), walkId]);
  });
  return getWalk(db, walkId);
}

/**
 * The id of the walk that should receive new GPS fixes: the one that is active (not paused).
 * Used by the background location task, which does not know which screen is open.
 */
export function getRunningWalkId(db: SqlDb): string | null {
  const row = db.all(
    "SELECT id FROM walk WHERE status = 'active' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
  )[0];
  return row === undefined ? null : String(row['id']);
}
