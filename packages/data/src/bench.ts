import type { SqlDb } from './sql';

export interface BenchResult {
  readonly points: number;
  readonly insertMs: number;
  /** Median and worst of the timed range queries, in milliseconds. */
  readonly queryMedianMs: number;
  readonly queryMaxMs: number;
  readonly rowsPerQuery: number;
  readonly usesIndex: boolean;
}

const WALKS = 1000;

function isoAt(baseMs: number, seconds: number): string {
  return new Date(baseMs + seconds * 1000).toISOString();
}

/**
 * Spike S4 workload (spec 11.5): fill `track_point` with `points` rows spread over many walks, then
 * time the query the app runs most often (all points of one walk between two timestamps).
 * The clock is injected so the same code runs on Node and in Hermes.
 */
export function runTrackBenchmark(
  db: SqlDb,
  points: number,
  clock: () => number,
  queries = 50,
): BenchResult {
  const base = Date.UTC(2026, 0, 1);
  const perWalk = Math.ceil(points / WALKS);
  const stamp = isoAt(base, 0);

  const insertStart = clock();
  db.transaction(() => {
    db.runMany(
      'INSERT INTO walk (id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      Array.from({ length: WALKS }, (_, i) => [
        `bench-walk-${String(i)}`,
        'completed',
        stamp,
        stamp,
        stamp,
      ]),
    );
    let written = 0;
    for (let walk = 0; walk < WALKS && written < points; walk += 1) {
      const count = Math.min(perWalk, points - written);
      const rows = Array.from({ length: count }, (_, i) => [
        `bench-walk-${String(walk)}`,
        isoAt(base + walk * 86_400_000, i),
        55 + i * 1e-5,
        37 + i * 1e-5,
        7,
        150,
        1.2,
      ]);
      db.runMany(
        'INSERT INTO track_point (walk_id, ts, lat, lon, accuracy_m, altitude_m, speed_mps) VALUES (?, ?, ?, ?, ?, ?, ?)',
        rows,
      );
      written += count;
    }
  });
  const insertMs = clock() - insertStart;

  const sql =
    'SELECT ts, lat, lon, accuracy_m, speed_mps FROM track_point WHERE walk_id = ? AND ts BETWEEN ? AND ? AND excluded = 0 ORDER BY ts';
  const timings: number[] = [];
  let rowsPerQuery = 0;
  for (let q = 0; q < queries; q += 1) {
    const walk = (q * 37) % WALKS;
    const from = isoAt(base + walk * 86_400_000, 0);
    const to = isoAt(base + walk * 86_400_000, perWalk);
    const start = clock();
    const rows = db.all(sql, [`bench-walk-${String(walk)}`, from, to]);
    timings.push(clock() - start);
    rowsPerQuery = rows.length;
  }
  timings.sort((a, b) => a - b);

  const plan = db
    .all(`EXPLAIN QUERY PLAN ${sql}`, ['bench-walk-0', stamp, stamp])
    .map((r) => String(r['detail']))
    .join(' | ');

  return {
    points,
    insertMs: Math.round(insertMs),
    queryMedianMs: timings[Math.floor(timings.length / 2)] ?? 0,
    queryMaxMs: timings[timings.length - 1] ?? 0,
    rowsPerQuery,
    usesIndex: plan.includes('idx_track_walk_ts'),
  };
}
