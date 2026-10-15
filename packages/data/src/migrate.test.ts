import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openNodeDb } from './adapters/node';
import { migrate, type Migration } from './migrate';
import { MIGRATIONS } from './migrations.generated';
import { SCHEMA_TABLES } from './schema';
import { configureConnection } from './sql';

const NOW = '2026-10-15T12:00:00Z';
const now = (): string => NOW;

let db: ReturnType<typeof openNodeDb>;

beforeEach(() => {
  db = openNodeDb();
  configureConnection(db);
});
afterEach(() => {
  db.close();
});

const tableNames = (): string[] =>
  db
    .all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((r) => String(r['name']));

describe('migration files', () => {
  it('generated module matches the .sql files on disk (run `pnpm --filter @pawquest/data gen`)', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
    const files = readdirSync(dir).sort();
    expect(files.length).toBe(MIGRATIONS.length);
    files.forEach((file, index) => {
      const migration = MIGRATIONS[index];
      expect(file).toBe(
        `${String(migration?.version).padStart(4, '0')}_${String(migration?.name)}.sql`,
      );
      expect(migration?.sql).toBe(readFileSync(join(dir, file), 'utf8'));
    });
  });

  it('are numbered 1..n', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});

describe('migrate', () => {
  it('builds the full schema on an empty database', () => {
    const result = migrate(db, MIGRATIONS, now);
    expect(result).toEqual({ from: 0, to: MIGRATIONS.length, applied: [1, 2] });
    // 28 tables of 0001 (incl. schema_migrations) + project, project_stage, food_item, food_log,
    // prompt_state, rest_day from 0002.
    expect(tableNames()).toHaveLength(34);
    expect(tableNames()).toEqual(
      expect.arrayContaining(['dog', 'track_point', 'food_log', 'rest_day']),
    );
    expect(db.all('SELECT version, applied_at FROM schema_migrations ORDER BY version')).toEqual([
      { version: 1, applied_at: NOW },
      { version: 2, applied_at: NOW },
    ]);
  });

  it('is idempotent: a second run applies nothing', () => {
    migrate(db, MIGRATIONS, now);
    expect(migrate(db, MIGRATIONS, now)).toEqual({ from: 2, to: 2, applied: [] });
  });

  it('refuses a database newer than the app', () => {
    migrate(db, MIGRATIONS, now);
    expect(() => migrate(db, MIGRATIONS.slice(0, 1), now)).toThrow(/newer than this app/);
  });

  it('rejects a numbering gap', () => {
    const gap: Migration[] = [{ version: 2, name: 'x', sql: 'SELECT 1' }];
    expect(() => migrate(db, gap, now)).toThrow(/without gaps/);
  });

  it('rolls back a failing migration completely and does not record it', () => {
    const bad: Migration[] = [
      ...MIGRATIONS,
      {
        version: 3,
        name: 'broken',
        sql: 'CREATE TABLE half_done (id INTEGER); INSERT INTO no_such_table VALUES (1);',
      },
    ];
    expect(() => migrate(db, bad, now)).toThrow();
    expect(tableNames()).not.toContain('half_done');
    expect(db.all('SELECT MAX(version) AS v FROM schema_migrations')[0]?.['v']).toBe(2);
    // the app can still start with the known migrations afterwards
    expect(migrate(db, MIGRATIONS, now).applied).toEqual([]);
  });

  it('rolls back a migration that leaves a dangling foreign key', () => {
    migrate(db, MIGRATIONS, now);
    const bad: Migration[] = [
      ...MIGRATIONS,
      {
        version: 3,
        name: 'dangling',
        // foreign keys are enforced per statement, so switch them off the way a table-rebuild would
        sql: "PRAGMA defer_foreign_keys = ON; INSERT INTO walk_dog (walk_id, dog_id) VALUES ('missing-walk', 'missing-dog');",
      },
    ];
    expect(() => migrate(db, bad, now)).toThrow(/broken foreign keys|FOREIGN KEY/);
    expect(db.all('SELECT * FROM walk_dog')).toEqual([]);
    expect(db.all('SELECT MAX(version) AS v FROM schema_migrations')[0]?.['v']).toBe(2);
  });

  it('0002 keeps data written under version 1 and adds the new columns as NULL', () => {
    migrate(db, MIGRATIONS.slice(0, 1), now);
    db.run("INSERT INTO dog (id, name, created_at, updated_at) VALUES ('d1', 'Луна', ?, ?)", [
      NOW,
      NOW,
    ]);
    db.run(
      "INSERT INTO skill (id, dog_id, name, created_at, updated_at) VALUES ('s1', 'd1', 'Подзыв', ?, ?)",
      [NOW, NOW],
    );
    db.run(
      "INSERT INTO training_session (id, dog_id, skill_id, started_at, created_at, updated_at) VALUES ('t1', 'd1', 's1', ?, ?, ?)",
      [NOW, NOW, NOW],
    );
    db.run(
      "INSERT INTO training_attempt (id, session_id, ts, result) VALUES ('a1', 't1', ?, 'successful')",
      [NOW],
    );
    db.run(
      "INSERT INTO weight_log (id, dog_id, measured_at, weight_g, created_at, updated_at) VALUES ('w1', 'd1', ?, 6200, ?, ?)",
      [NOW, NOW, NOW],
    );

    expect(migrate(db, MIGRATIONS, now).applied).toEqual([2]);

    expect(db.all('SELECT name FROM dog')).toEqual([{ name: 'Луна' }]);
    expect(db.all('SELECT project_id, engagement FROM training_session')).toEqual([
      { project_id: null, engagement: null },
    ]);
    expect(db.all('SELECT result, meta FROM training_attempt')).toEqual([
      { result: 'successful', meta: null },
    ]);
    expect(db.all('SELECT weight_g, conditions FROM weight_log')).toEqual([
      { weight_g: 6200, conditions: null },
    ]);
  });
});

describe('schema rules from the spec', () => {
  beforeEach(() => {
    migrate(db, MIGRATIONS, now);
    db.run("INSERT INTO dog (id, name, created_at, updated_at) VALUES ('d1', 'Луна', ?, ?)", [
      NOW,
      NOW,
    ]);
    db.run(
      "INSERT INTO walk (id, status, started_at, created_at, updated_at) VALUES ('w1', 'completed', ?, ?, ?)",
      [NOW, NOW, NOW],
    );
  });

  it('enforces foreign keys', () => {
    expect(() =>
      db.run("INSERT INTO track_point (walk_id, ts, lat, lon) VALUES ('nope', ?, 1, 1)", [NOW]),
    ).toThrow(/FOREIGN KEY/);
  });

  it('enforces CHECK lists and ranges', () => {
    expect(() =>
      db.run(
        "INSERT INTO dog (id, name, sex, created_at, updated_at) VALUES ('d2', 'X', 'robot', ?, ?)",
        [NOW, NOW],
      ),
    ).toThrow(/CHECK/);
    expect(() => db.run("UPDATE walk SET mood = 6 WHERE id = 'w1'")).toThrow(/CHECK/);
  });

  it('deleting a walk cascades to its track points', () => {
    db.runMany('INSERT INTO track_point (walk_id, ts, lat, lon) VALUES (?, ?, ?, ?)', [
      ['w1', NOW, 55.7, 37.6],
      ['w1', NOW, 55.8, 37.7],
    ]);
    db.run("DELETE FROM walk WHERE id = 'w1'");
    expect(db.all('SELECT COUNT(*) AS n FROM track_point')[0]?.['n']).toBe(0);
  });

  it('range query on (walk_id, ts) uses the index', () => {
    const plan = db
      .all(
        "EXPLAIN QUERY PLAN SELECT * FROM track_point WHERE walk_id = 'w1' AND ts BETWEEN 'a' AND 'b' ORDER BY ts",
      )
      .map((r) => String(r['detail']))
      .join(' | ');
    expect(plan).toContain('idx_track_walk_ts');
    expect(plan).not.toMatch(/SCAN track_point/);
  });
});

describe('Drizzle schema mirrors the database', () => {
  const tables = Object.values(SCHEMA_TABLES).map(
    (t) => [getTableConfig(t as SQLiteTable).name, t] as const,
  );

  it.each(tables)(
    'table %s has the same columns, types, nullability and primary key',
    (name, table) => {
      migrate(db, MIGRATIONS, now);
      const config = getTableConfig(table as SQLiteTable);
      const actual = db.all(`PRAGMA table_info(${name})`).map((c) => ({
        name: String(c['name']),
        type: String(c['type']).toLowerCase(),
        notNull: c['notnull'] === 1 || c['pk'] === 1,
        pk: c['pk'] === 1,
      }));
      const declared = config.columns.map((c) => ({
        name: c.name,
        type: c.getSQLType(),
        notNull: c.notNull,
        pk: c.primary,
      }));
      expect(declared).toEqual(actual);

      const indexes = db
        .all(`PRAGMA index_list(${name})`)
        .map((i) => String(i['name']))
        .filter((n) => n.startsWith('idx_'))
        .sort();
      expect(config.indexes.map((i) => i.config.name).sort()).toEqual(indexes);

      const foreignKeys = db.all(`PRAGMA foreign_key_list(${name})`).map((f) => ({
        from: String(f['from']),
        table: String(f['table']),
        to: String(f['to']),
        onDelete: String(f['on_delete']).toLowerCase(),
      }));
      const declaredKeys = config.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          from: ref.columns.map((c) => c.name).join(','),
          table: getTableConfig(ref.foreignTable).name,
          to: ref.foreignColumns.map((c) => c.name).join(','),
          onDelete: (fk.onDelete ?? 'no action').toLowerCase(),
        };
      });
      expect(declaredKeys).toEqual(foreignKeys);
    },
  );
});
