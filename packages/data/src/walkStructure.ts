import { expectFound, toIso, type Ctx } from './ids';
import { computeWalkMetrics } from './recorder';
import type { SqlDb } from './sql';
import { getWalk, type Walk } from './walks';

/** Pictures, events and segments are moved as the track is cut; the totals are measured again. */

/** Measures the walk again over [start, end] and writes the totals into its row. */
function refreshTotals(db: SqlDb, ctx: Ctx, walkId: string, endedAt: number): void {
  const walk = getWalk(db, walkId);
  if (walk === null) {
    return;
  }
  const metrics = computeWalkMetrics(db, walkId, endedAt);
  db.run(
    `UPDATE walk SET ended_at = ?, duration_s = ?, moving_s = ?, paused_s = ?, ride_s = ?,
            distance_m = ?, updated_at = ?
      WHERE id = ?`,
    [
      toIso(endedAt),
      Math.max(0, Math.round((endedAt - walk.startedAt) / 1000 - metrics.rideS)),
      Math.round(metrics.movingS),
      Math.round(metrics.pausedS),
      Math.round(metrics.rideS),
      Math.round(metrics.distanceM),
      toIso(ctx.now()),
      walkId,
    ],
  );
}

function assertCuttable(walk: Walk | null, at: number): Walk {
  if (walk?.status !== 'completed' || walk.endedAt === null) {
    throw new Error('Only a finished walk can be cut');
  }
  if (!(at > walk.startedAt && at < walk.endedAt)) {
    throw new RangeError('The cut must lie inside the walk');
  }
  return walk;
}

/** Marks the fixes the owner cut off (0 = in use; 1 = outliers, see the filter). */
export const TRIMMED_FIX = 2;

/**
 * Cuts the end of a finished walk off (D-62, 5.1 item 5): the walk is over at `at` (the moment
 * the owner came home), what was recorded after is not walking. The fixes after `at` are kept but
 * marked as cut, the totals are measured again. Events after the cut stay with the walk.
 */
export function trimWalkEnd(db: SqlDb, ctx: Ctx, walkId: string, at: number): Walk {
  assertCuttable(getWalk(db, walkId), at);
  db.transaction(() => {
    db.run(
      `UPDATE walk_segment SET ended_at = ?
        WHERE walk_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)`,
      [toIso(at), walkId, toIso(at), toIso(at)],
    );
    db.run('DELETE FROM walk_segment WHERE walk_id = ? AND started_at >= ?', [walkId, toIso(at)]);
    db.run('UPDATE track_point SET excluded = ? WHERE walk_id = ? AND excluded = 0 AND ts > ?', [
      TRIMMED_FIX,
      walkId,
      toIso(at),
    ]);
    refreshTotals(db, ctx, walkId, at);
  });
  return expectFound(getWalk(db, walkId), 'walk');
}

/**
 * Splits a finished walk in two at `at` (a walk that was not finished when the owner came to a
 * base): the track, the segments, the events, the training sessions and the pictures from `at`
 * on go to a new walk with the same dogs; both are measured again. The first keeps the weather,
 * the place and the owner's notes. Returns both.
 */
export function splitWalk(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  at: number,
): { first: Walk; second: Walk } {
  const walk = assertCuttable(getWalk(db, walkId), at);
  const endedAt = walk.endedAt ?? at;
  const secondId = ctx.newId();
  const base = db.all('SELECT tz_offset_min, mode FROM walk WHERE id = ?', [walkId])[0];
  db.transaction(() => {
    const nowIso = toIso(ctx.now());
    db.run(
      `INSERT INTO walk (id, status, mode, started_at, ended_at, tz_offset_min, summary_pending, created_at, updated_at)
       VALUES (?, 'completed', ?, ?, ?, ?, 1, ?, ?)`,
      [
        secondId,
        String(base?.['mode'] ?? 'gps'),
        toIso(at),
        toIso(endedAt),
        Number(base?.['tz_offset_min'] ?? 0),
        nowIso,
        nowIso,
      ],
    );
    db.run(
      'INSERT INTO walk_dog (walk_id, dog_id) SELECT ?, dog_id FROM walk_dog WHERE walk_id = ?',
      [secondId, walkId],
    );
    // a segment that crosses the cut is shared by both walks
    for (const row of db.all(
      `SELECT id, kind, ended_at FROM walk_segment
        WHERE walk_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)`,
      [walkId, toIso(at), toIso(at)],
    )) {
      db.run(
        'INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
        [ctx.newId(), secondId, String(row['kind']), toIso(at), row['ended_at'] ?? toIso(endedAt)],
      );
      db.run('UPDATE walk_segment SET ended_at = ? WHERE id = ?', [toIso(at), String(row['id'])]);
    }
    db.run('UPDATE walk_segment SET walk_id = ? WHERE walk_id = ? AND started_at >= ?', [
      secondId,
      walkId,
      toIso(at),
    ]);
    db.run('UPDATE track_point SET walk_id = ? WHERE walk_id = ? AND ts >= ?', [
      secondId,
      walkId,
      toIso(at),
    ]);
    db.run('UPDATE event SET walk_id = ? WHERE walk_id = ? AND ts >= ?', [
      secondId,
      walkId,
      toIso(at),
    ]);
    db.run('UPDATE training_session SET walk_id = ? WHERE walk_id = ? AND started_at >= ?', [
      secondId,
      walkId,
      toIso(at),
    ]);
    db.run(
      "UPDATE attachment SET owner_id = ? WHERE owner_table = 'walk' AND owner_id = ? AND taken_at >= ?",
      [secondId, walkId, toIso(at)],
    );
    refreshTotals(db, ctx, walkId, at);
    refreshTotals(db, ctx, secondId, endedAt);
  });
  return {
    first: expectFound(getWalk(db, walkId), 'walk'),
    second: expectFound(getWalk(db, secondId), 'walk'),
  };
}

/**
 * Splits a walk around a stay in a base: the first walk ends when the owner arrived, the second
 * starts when they left, the time in between (not walking) belongs to neither.
 */
export function splitWalkAroundStay(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  arrivedAt: number,
  leftAt: number,
): { first: Walk; second: Walk } {
  if (!(arrivedAt < leftAt)) {
    throw new RangeError('The stay must end after it begins');
  }
  return db.transaction(() => {
    const { second } = splitWalk(db, ctx, walkId, leftAt);
    return { first: trimWalkEnd(db, ctx, walkId, arrivedAt), second };
  });
}
