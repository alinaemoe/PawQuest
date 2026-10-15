import type { SqlDb } from './sql';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
}

function assertSequence(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations must be numbered 1, 2, 3... without gaps: found ${String(migration.version)} at position ${String(index + 1)}`,
      );
    }
  });
}

function currentVersion(db: SqlDb): number {
  const row = db.all('SELECT MAX(version) AS v FROM schema_migrations')[0];
  const version = row?.['v'];
  return typeof version === 'number' ? version : 0;
}

/**
 * Applies every migration newer than the database, each in its own transaction (spec 08 §8.1:
 * numbered SQL files, forward only). A database newer than the app is refused instead of guessed
 * at, and a migration that leaves a dangling foreign key is rolled back.
 */
export function migrate(
  db: SqlDb,
  migrations: readonly Migration[],
  now: () => string,
): MigrationResult {
  assertSequence(migrations);
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const from = currentVersion(db);
  if (from > migrations.length) {
    throw new Error(
      `Database schema version ${String(from)} is newer than this app knows (${String(migrations.length)}). Update the app.`,
    );
  }
  const applied: number[] = [];
  for (const migration of migrations.slice(from)) {
    db.transaction(() => {
      db.exec(migration.sql);
      const broken = db.all('PRAGMA foreign_key_check');
      if (broken.length > 0) {
        throw new Error(
          `Migration ${String(migration.version)} (${migration.name}) left ${String(broken.length)} broken foreign keys`,
        );
      }
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        migration.version,
        now(),
      ]);
    });
    applied.push(migration.version);
  }
  return { from, to: from + applied.length, applied };
}
