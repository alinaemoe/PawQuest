import {
  MIGRATIONS,
  configureConnection,
  migrate,
  runTrackBenchmark,
  schema,
  type BenchResult,
} from '@pawquest/data';
import { openExpoDb } from '@pawquest/data/expo';
import { and, asc, between, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { deleteDatabaseSync } from 'expo-sqlite';

export interface DbCheckStep {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DbCheckResult {
  readonly steps: DbCheckStep[];
  readonly bench: BenchResult | null;
}

const DB_NAME = 'spike-s4.db';
const NOW = '2026-10-15T12:00:00Z';

/** The file is missing on the first run, and deleting a missing database throws. */
function dropDatabase(): void {
  try {
    deleteDatabaseSync(DB_NAME);
  } catch {
    // nothing to delete
  }
}

function step(name: string, run: () => string | null): DbCheckStep {
  try {
    const failure = run();
    return { name, ok: failure === null, detail: failure ?? 'ok' };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Spike S4 on the device: migrations 0001 -> 0002 over real data, a Drizzle query on the expo-sqlite
 * driver, then the track_point workload. Uses a throwaway database file, never the app's own.
 */
export function runDbCheck(points: number): DbCheckResult {
  const steps: DbCheckStep[] = [];
  dropDatabase();
  const db = openExpoDb(DB_NAME);
  let bench: BenchResult | null = null;
  try {
    steps.push(
      step('соединение: внешние ключи и WAL', () => {
        configureConnection(db);
        const fk = db.all('PRAGMA foreign_keys')[0]?.['foreign_keys'];
        const wal = db.all('PRAGMA journal_mode')[0]?.['journal_mode'];
        return fk === 1 && wal === 'wal' ? null : `fk=${String(fk)} journal=${String(wal)}`;
      }),
    );

    steps.push(
      step('миграция 0001 на пустой базе', () => {
        const r = migrate(db, MIGRATIONS.slice(0, 1), () => NOW);
        return r.to === 1 ? null : `to=${String(r.to)}`;
      }),
    );

    steps.push(
      step('данные версии 1 записаны', () => {
        db.run("INSERT INTO dog (id, name, created_at, updated_at) VALUES ('d1', 'Луна', ?, ?)", [
          NOW,
          NOW,
        ]);
        db.run(
          "INSERT INTO weight_log (id, dog_id, measured_at, weight_g, created_at, updated_at) VALUES ('w1', 'd1', ?, 6200, ?, ?)",
          [NOW, NOW, NOW],
        );
        return null;
      }),
    );

    steps.push(
      step('миграция 0002 сохраняет данные', () => {
        const r = migrate(db, MIGRATIONS, () => NOW);
        const row = db.all('SELECT weight_g, conditions FROM weight_log')[0];
        const name = db.all('SELECT name FROM dog')[0]?.['name'];
        return r.applied.join() === '2' &&
          row?.['weight_g'] === 6200 &&
          row['conditions'] === null &&
          name === 'Луна'
          ? null
          : `applied=${r.applied.join()} row=${JSON.stringify(row)} name=${String(name)}`;
      }),
    );

    steps.push(
      step('повторный запуск ничего не меняет', () => {
        const r = migrate(db, MIGRATIONS, () => NOW);
        return r.applied.length === 0 ? null : `applied=${r.applied.join()}`;
      }),
    );

    steps.push(
      step('откат вложенной транзакции', () => {
        db.transaction(() => {
          db.run("INSERT INTO rest_day (day, created_at) VALUES ('2026-10-01', ?)", [NOW]);
          try {
            db.transaction(() => {
              db.run("INSERT INTO rest_day (day, created_at) VALUES ('2026-10-02', ?)", [NOW]);
              throw new Error('inner');
            });
          } catch {
            // expected
          }
        });
        const days = db.all('SELECT day FROM rest_day ORDER BY day').map((r) => String(r['day']));
        return days.join() === '2026-10-01' ? null : `days=${days.join()}`;
      }),
    );

    steps.push(
      step('Drizzle на expo-sqlite', () => {
        const orm = drizzle(db.handle);
        orm
          .insert(schema.walk)
          .values({
            id: 'dz',
            status: 'completed',
            startedAt: NOW,
            createdAt: NOW,
            updatedAt: NOW,
          })
          .run();
        orm
          .insert(schema.trackPoint)
          .values(
            [0, 1, 2, 3].map((i) => ({
              walkId: 'dz',
              ts: `2026-10-15T12:00:0${String(i)}Z`,
              lat: 55 + i,
              lon: 37,
            })),
          )
          .run();
        const rows = orm
          .select()
          .from(schema.trackPoint)
          .where(
            and(
              eq(schema.trackPoint.walkId, 'dz'),
              between(schema.trackPoint.ts, '2026-10-15T12:00:01Z', '2026-10-15T12:00:02Z'),
            ),
          )
          .orderBy(asc(schema.trackPoint.ts))
          .all();
        return rows.length === 2 && rows[0]?.lat === 56 && rows[1]?.lat === 57
          ? null
          : JSON.stringify(rows);
      }),
    );

    if (points > 0) {
      db.transaction(() => {
        db.run('DELETE FROM track_point');
        db.run("DELETE FROM walk WHERE id = 'dz'");
      });
      bench = runTrackBenchmark(db, points, () => performance.now());
      steps.push(
        step('запрос по (walk_id, ts) < 50 мс, индекс используется', () =>
          bench !== null && bench.usesIndex && bench.queryMaxMs < 50
            ? null
            : `макс ${String(bench?.queryMaxMs.toFixed(1))} мс, индекс ${String(bench?.usesIndex)}`,
        ),
      );
    }
  } finally {
    db.handle.closeSync();
    dropDatabase();
  }
  return { steps, bench };
}
