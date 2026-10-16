import { expectFound, fromIso, toIso, type Ctx } from './ids';
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

/**
 * `trimWalkEnd` that can be taken back: `undo` puts the segments, the totals and the cut fixes
 * as they were. It only holds while nothing else changed the walk (a toast's lifetime).
 */
export function trimWalkEndUndoable(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  at: number,
): { walk: Walk; undo: () => void } {
  const before = db.all(
    'SELECT ended_at, duration_s, moving_s, paused_s, ride_s, distance_m FROM walk WHERE id = ?',
    [walkId],
  )[0];
  const segments = db.all(
    'SELECT id, kind, started_at, ended_at FROM walk_segment WHERE walk_id = ?',
    [walkId],
  );
  const walk = trimWalkEnd(db, ctx, walkId, at);
  return {
    walk,
    undo: () => {
      if (before === undefined) {
        return;
      }
      db.transaction(() => {
        db.run('DELETE FROM walk_segment WHERE walk_id = ?', [walkId]);
        for (const row of segments) {
          db.run(
            'INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
            [
              String(row['id']),
              walkId,
              String(row['kind']),
              String(row['started_at']),
              row['ended_at'] ?? null,
            ],
          );
        }
        db.run('UPDATE track_point SET excluded = 0 WHERE walk_id = ? AND excluded = ?', [
          walkId,
          TRIMMED_FIX,
        ]);
        db.run(
          `UPDATE walk SET ended_at = ?, duration_s = ?, moving_s = ?, paused_s = ?, ride_s = ?,
                  distance_m = ?, updated_at = ? WHERE id = ?`,
          [
            before['ended_at'] ?? null,
            before['duration_s'] ?? null,
            before['moving_s'] ?? null,
            before['paused_s'] ?? null,
            before['ride_s'] ?? 0,
            before['distance_m'] ?? null,
            toIso(ctx.now()),
            walkId,
          ],
        );
      });
    },
  };
}

export interface IndoorSpan {
  readonly fromTs: number;
  readonly toTs: number;
}

/** The stretches of a walk the owner marked as spent indoors without the dog. */
export function listIndoor(db: SqlDb, walkId: string): IndoorSpan[] {
  return db
    .all(
      `SELECT started_at, ended_at FROM walk_segment
        WHERE walk_id = ? AND indoor = 1 AND ended_at IS NOT NULL ORDER BY started_at`,
      [walkId],
    )
    .map((row) => ({
      fromTs: fromIso(String(row['started_at'])),
      toTs: fromIso(String(row['ended_at'])),
    }));
}

/**
 * "Inside" (D-62, 5.3): the owner went in without the dog between `fromTs` and `toTs`. The time is
 * a pause put in afterwards: it leaves the moving time and the pace, the visit stays in the
 * timeline. Marks can be taken back with `clearIndoor`.
 */
export function markIndoor(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  fromTs: number,
  toTs: number,
): Walk {
  const walk = assertCuttable(getWalk(db, walkId), fromTs);
  const end = walk.endedAt ?? toTs;
  if (!(toTs > fromTs) || toTs > end) {
    throw new RangeError('The inside time must lie inside the walk');
  }
  db.transaction(() => {
    const crossing = db.all(
      `SELECT id, started_at, ended_at FROM walk_segment
        WHERE walk_id = ? AND kind = 'moving' AND started_at < ? AND COALESCE(ended_at, ?) > ?`,
      [walkId, toIso(toTs), toIso(end), toIso(fromTs)],
    );
    for (const row of crossing) {
      const from = fromIso(String(row['started_at']));
      const to = row['ended_at'] === null ? end : fromIso(String(row['ended_at']));
      db.run('DELETE FROM walk_segment WHERE id = ?', [String(row['id'])]);
      const piece = (kind: 'moving' | 'paused', a: number, b: number, indoor: 0 | 1): void => {
        if (b > a) {
          db.run(
            'INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at, indoor) VALUES (?, ?, ?, ?, ?, ?)',
            [ctx.newId(), walkId, kind, toIso(a), toIso(b), indoor],
          );
        }
      };
      piece('moving', from, Math.min(to, fromTs), 0);
      piece('paused', Math.max(from, fromTs), Math.min(to, toTs), 1);
      piece('moving', Math.max(from, toTs), to, 0);
    }
    refreshTotals(db, ctx, walkId, end);
  });
  return expectFound(getWalk(db, walkId), 'walk');
}

/** Takes the "inside" marks that touch the given time back: that time counts as walking again. */
export function clearIndoor(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  fromTs: number,
  toTs: number,
): Walk {
  const walk = expectFound(getWalk(db, walkId), 'walk');
  db.transaction(() => {
    db.run(
      `UPDATE walk_segment SET kind = 'moving', indoor = 0
        WHERE walk_id = ? AND indoor = 1 AND started_at < ? AND ended_at > ?`,
      [walkId, toIso(toTs), toIso(fromTs)],
    );
    if (walk.endedAt !== null) {
      refreshTotals(db, ctx, walkId, walk.endedAt);
    }
  });
  return expectFound(getWalk(db, walkId), 'walk');
}
