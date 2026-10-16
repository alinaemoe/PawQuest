import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openNodeDb } from './adapters/node';
import { migrate, type Migration } from './migrate';
import { MIGRATIONS } from './migrations.generated';
import { configureConnection } from './sql';

// Migration 0006 rebuilds the `place` table (new type list in a CHECK). Everything that points at
// places must survive that, and foreign keys must be back on afterwards.

const NOW = '2026-10-15T12:00:00Z';
const now = (): string => NOW;
const V5 = MIGRATIONS.slice(0, 5);

let db: ReturnType<typeof openNodeDb>;
beforeEach(() => {
  db = openNodeDb();
  configureConnection(db);
});
afterEach(() => {
  db.close();
});

const foreignKeys = (): unknown => db.all('PRAGMA foreign_keys')[0]?.['foreign_keys'];

function seedAtVersion5(): void {
  migrate(db, V5, now);
  db.run("INSERT INTO dog (id, name, created_at, updated_at) VALUES ('d1', 'Фрэнни', ?, ?)", [
    NOW,
    NOW,
  ]);
  const place = (id: string, name: string, category: string, parent: string | null, lat: number) =>
    db.run(
      `INSERT INTO place (id, name, category, parent_id, name_norm, lat, lon, radius_m, geohash8, color, icon, notes, is_demo, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, 37.6, 77, 'g', 'red', 'tree', 'утки', 1, ?, ?, ?)`,
      [id, name, category, parent, name.toLowerCase(), lat, NOW, NOW, id === 'p3' ? NOW : null],
    );
  place('p1', 'Парк', 'park', null, 55.1);
  place('p2', 'Луг у дома', 'meadow', 'p1', 55.2); // a child of p1
  place('p3', 'Удалённое', 'vet', null, 55.3); // in the trash
  db.run('INSERT INTO place_alias (alias_norm, place_id, created_at) VALUES (?, ?, ?)', [
    'сквер',
    'p1',
    NOW,
  ]);
  db.run(
    "INSERT INTO walk (id, status, started_at, place_id, created_at, updated_at) VALUES ('w1', 'completed', ?, 'p1', ?, ?)",
    [NOW, NOW, NOW],
  );
  db.run(
    "INSERT INTO event (id, dog_id, walk_id, type_id, ts, place_id, created_at, updated_at) VALUES ('e1', 'd1', 'w1', 'toilet', ?, 'p2', ?, ?)",
    [NOW, NOW, NOW],
  );
  db.run(
    "INSERT INTO skill (id, dog_id, name, created_at, updated_at) VALUES ('s1', 'd1', 'Подзыв', ?, ?)",
    [NOW, NOW],
  );
  db.run(
    "INSERT INTO training_session (id, dog_id, skill_id, place_id, started_at, created_at, updated_at) VALUES ('t1', 'd1', 's1', 'p2', ?, ?, ?)",
    [NOW, NOW, NOW],
  );
}

describe('0006 place types: the rebuild keeps everything', () => {
  it('keeps every place column, the parent link and the trash flag', () => {
    seedAtVersion5();
    const before = db.all('SELECT * FROM place ORDER BY id');
    migrate(db, MIGRATIONS, now);
    expect(db.all('SELECT * FROM place ORDER BY id')).toEqual(before);
    expect(before).toHaveLength(3);
    expect(before[1]?.['parent_id']).toBe('p1');
    expect(before[2]?.['deleted_at']).toBe(NOW);
  });

  it('keeps the links from walks, events, sessions and aliases', () => {
    seedAtVersion5();
    migrate(db, MIGRATIONS, now);
    expect(db.all("SELECT place_id FROM walk WHERE id = 'w1'")).toEqual([{ place_id: 'p1' }]);
    expect(db.all("SELECT place_id FROM event WHERE id = 'e1'")).toEqual([{ place_id: 'p2' }]);
    expect(db.all("SELECT place_id FROM training_session WHERE id = 't1'")).toEqual([
      { place_id: 'p2' },
    ]);
    expect(db.all('SELECT alias_norm, place_id FROM place_alias')).toEqual([
      { alias_norm: 'сквер', place_id: 'p1' },
    ]);
  });

  it('leaves foreign keys on, with nothing dangling', () => {
    seedAtVersion5();
    migrate(db, MIGRATIONS, now);
    expect(foreignKeys()).toBe(1);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('foreign key actions work again on the rebuilt table', () => {
    seedAtVersion5();
    migrate(db, MIGRATIONS, now);
    db.run("DELETE FROM place WHERE id = 'p2'");
    expect(db.all("SELECT place_id FROM event WHERE id = 'e1'")).toEqual([{ place_id: null }]);
    db.run("DELETE FROM place WHERE id = 'p1'");
    expect(db.all("SELECT place_id FROM walk WHERE id = 'w1'")).toEqual([{ place_id: null }]);
    expect(db.all('SELECT * FROM place_alias')).toEqual([]); // ON DELETE CASCADE
    // a new walk cannot point at a place that does not exist
    expect(() =>
      db.run(
        "INSERT INTO walk (id, status, started_at, place_id, created_at, updated_at) VALUES ('w9', 'completed', ?, 'nope', ?, ?)",
        [NOW, NOW, NOW],
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  it('keeps both indexes', () => {
    migrate(db, MIGRATIONS, now);
    const indexes = db
      .all("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'place'")
      .map((r) => String(r['name']));
    expect(indexes).toContain('idx_place_geohash');
    expect(indexes).toContain('idx_place_name_norm');
  });

  it('accepts the new types and still rejects an unknown one', () => {
    migrate(db, MIGRATIONS, now);
    const insert = (id: string, category: string) =>
      db.run(
        `INSERT INTO place (id, name, category, name_norm, lat, lon, geohash8, created_at, updated_at)
         VALUES (?, 'x', ?, 'x', 55, 37, 'g', ?, ?)`,
        [id, category, NOW, NOW],
      );
    for (const category of [
      'square',
      'alley',
      'shop',
      'grooming',
      'home',
      'guests',
      'park',
      'other',
    ]) {
      insert(`ok-${category}`, category);
    }
    expect(() => insert('bad', 'castle')).toThrow(/CHECK/);
    expect(db.all('SELECT COUNT(*) AS n FROM place')[0]?.['n']).toBe(8);
  });

  it('runs on an empty places table', () => {
    migrate(db, MIGRATIONS, now);
    expect(db.all('SELECT * FROM place')).toEqual([]);
    expect(foreignKeys()).toBe(1);
  });
});

describe('the foreign-keys-off marker', () => {
  const base: Migration[] = [...MIGRATIONS];
  const next = (sql: string): Migration[] => [
    ...base,
    { version: base.length + 1, name: 'probe', sql },
  ];

  it('foreign keys are on again when the migration fails', () => {
    migrate(db, base, now);
    expect(() =>
      migrate(db, next('-- pq:foreign-keys-off\nSELECT * FROM table_that_does_not_exist;'), now),
    ).toThrow();
    expect(foreignKeys()).toBe(1);
    expect(db.all('SELECT MAX(version) AS v FROM schema_migrations')[0]?.['v']).toBe(base.length);
  });

  it('a migration that leaves a broken reference is still rolled back', () => {
    migrate(db, base, now);
    const sql =
      "-- pq:foreign-keys-off\nINSERT INTO walk_dog (walk_id, dog_id) VALUES ('missing-walk', 'missing-dog');";
    expect(() => migrate(db, next(sql), now)).toThrow(/broken foreign keys/);
    expect(db.all('SELECT * FROM walk_dog')).toEqual([]);
    expect(foreignKeys()).toBe(1);
  });

  it('without the marker foreign keys stay on during the migration', () => {
    migrate(db, base, now);
    const sql = "INSERT INTO walk_dog (walk_id, dog_id) VALUES ('missing-walk', 'missing-dog');";
    expect(() => migrate(db, next(sql), now)).toThrow(/FOREIGN KEY/);
  });

  it('refuses the marker when it cannot switch foreign keys off (inside a transaction)', () => {
    migrate(db, base, now);
    expect(() => {
      db.transaction(() => {
        migrate(db, next('-- pq:foreign-keys-off\nSELECT 1;'), now);
      });
    }).toThrow(/needs foreign keys off/);
    expect(foreignKeys()).toBe(1);
  });

  it('the marker is recognised only as the first line', () => {
    migrate(db, base, now);
    const sql =
      "SELECT 1;\n-- pq:foreign-keys-off\nINSERT INTO walk_dog (walk_id, dog_id) VALUES ('a', 'b');";
    expect(() => migrate(db, next(sql), now)).toThrow(/FOREIGN KEY/);
  });
});
