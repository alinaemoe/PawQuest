import type { Ctx } from './ids';
import { computeWalkMetrics } from './recorder';
import type { SqlDb } from './sql';

/**
 * Walk totals that a better rule changes are worked out again for the walks already recorded.
 * Raise `METRICS_VERSION` when a rule of `computeWalkMetrics` changes: each walk is measured again
 * once, a few at a time (the point is that a screen is never held up), and the version is written
 * when none is left. Only the time in motion is rewritten; the distance and the length of the walk
 * stay as they were.
 *
 * - 2: a gap in the track crossed at a walking speed counts as movement (D-72).
 */
export const METRICS_VERSION = 2;

const VERSION_KEY = 'metrics_version';
const CURSOR_KEY = 'metrics_cursor';

const read = (db: SqlDb, key: string): string | null => {
  const value = db.all('SELECT value FROM app_setting WHERE key = ?', [key])[0]?.['value'];
  return value === undefined || value === null ? null : String(value);
};

const write = (db: SqlDb, ctx: Ctx, key: string, value: string): void => {
  db.run(
    'INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date(ctx.now()).toISOString()],
  );
};

/** Measures up to `limit` walks again; returns how many are still to do (0 when all is current). */
export function refreshMovingTimes(db: SqlDb, ctx: Ctx, limit = 10): number {
  if (read(db, VERSION_KEY) === String(METRICS_VERSION)) {
    return 0;
  }
  // the cursor is the start and the id of the last walk done: walks may start at the same moment
  const [afterStart = '', afterId = ''] = (read(db, CURSOR_KEY) ?? '').split('|');
  const rows = db.all(
    `SELECT id, started_at, ended_at FROM walk
      WHERE status = 'completed' AND mode = 'gps' AND deleted_at IS NULL
        AND ended_at IS NOT NULL AND (started_at > ? OR (started_at = ? AND id > ?))
      ORDER BY started_at, id LIMIT ?`,
    [afterStart, afterStart, afterId, limit],
  );
  for (const row of rows) {
    const metrics = computeWalkMetrics(db, String(row['id']), Date.parse(String(row['ended_at'])));
    db.run('UPDATE walk SET moving_s = ?, paused_s = ?, ride_s = ? WHERE id = ?', [
      Math.round(metrics.movingS),
      Math.round(metrics.pausedS),
      Math.round(metrics.rideS),
      String(row['id']),
    ]);
    write(db, ctx, CURSOR_KEY, `${String(row['started_at'])}|${String(row['id'])}`);
  }
  if (rows.length < limit) {
    write(db, ctx, VERSION_KEY, String(METRICS_VERSION));
    return 0;
  }
  return 1;
}
