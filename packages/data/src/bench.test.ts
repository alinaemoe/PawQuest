import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openNodeDb } from './adapters/node';
import { runTrackBenchmark } from './bench';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations.generated';
import { configureConnection } from './sql';

let db: ReturnType<typeof openNodeDb>;

beforeEach(() => {
  db = openNodeDb();
  configureConnection(db);
  migrate(db, MIGRATIONS, () => '2026-10-15T00:00:00Z');
});
afterEach(() => {
  db.close();
});

describe('runTrackBenchmark', () => {
  it('writes exactly the requested number of points and reads one walk back in order', () => {
    const result = runTrackBenchmark(db, 5000, () => performance.now(), 5);
    expect(db.all('SELECT COUNT(*) AS n FROM track_point')[0]?.['n']).toBe(5000);
    expect(db.all('SELECT COUNT(*) AS n FROM walk')[0]?.['n']).toBe(1000);
    expect(result.points).toBe(5000);
    expect(result.rowsPerQuery).toBe(5); // 5000 points over 1000 walks
    expect(result.usesIndex).toBe(true);

    const ts = db
      .all("SELECT ts FROM track_point WHERE walk_id = 'bench-walk-3' ORDER BY id")
      .map((r) => String(r['ts']));
    expect(ts).toEqual([...ts].sort());
    expect(new Set(ts).size).toBe(ts.length);
  });

  it('handles a point count that does not divide evenly', () => {
    runTrackBenchmark(db, 2500, () => performance.now(), 2);
    expect(db.all('SELECT COUNT(*) AS n FROM track_point')[0]?.['n']).toBe(2500);
  });

  it('reports the injected clock', () => {
    let t = 0;
    const result = runTrackBenchmark(db, 1000, () => (t += 10), 3);
    expect(result.insertMs).toBe(10);
    expect(result.queryMedianMs).toBe(10);
  });
});

// Desktop reference run of the S4 workload (1M points). Slow, so opt-in: PQ_BENCH=1 pnpm test.
describe.runIf(process.env['PQ_BENCH'] === '1')('S4 workload on Node (1M points)', () => {
  it('range query on (walk_id, ts) stays under 50 ms', () => {
    const result = runTrackBenchmark(db, 1_000_000, () => performance.now());
    console.log(JSON.stringify(result));
    expect(result.usesIndex).toBe(true);
    expect(result.queryMaxMs).toBeLessThan(50);
  }, 300_000);
});
