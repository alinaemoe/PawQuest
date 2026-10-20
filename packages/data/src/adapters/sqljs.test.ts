import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { seedDemoData } from '../demo';
import { createDog } from '../dogs';
import { createCtx } from '../ids';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations.generated';
import { buildReport, REPORT_SECTIONS } from '../report';
import { configureConnection } from '../sql';
import { appendTrackPoints, finishWalk, startWalk } from '../recorder';
import { listWalks } from '../walks';
import { openSqlJsDb } from './sqljs';

let engine: SqlJsStatic;
beforeAll(async () => {
  engine = await initSqlJs();
});

function opened() {
  const db = openSqlJsDb(engine);
  configureConnection(db);
  const ctx = createCtx();
  migrate(db, MIGRATIONS, () => new Date(ctx.now()).toISOString());
  return { db, ctx };
}

describe('SqlDb on sql.js (the web demo)', () => {
  it('the same migrations, demo data and report run on the WebAssembly SQLite', () => {
    const { db, ctx } = opened();
    const dog = createDog(db, ctx, { name: 'Демо', isDemo: true });
    seedDemoData(db, ctx, dog.id, 'ru');
    expect(listWalks(db, dog.id, 0, ctx.now() + 86_400_000).length).toBeGreaterThan(5);
    const report = buildReport(
      db,
      {
        dogId: dog.id,
        fromTs: ctx.now() - 30 * 86_400_000,
        toTs: ctx.now() + 60_000,
        sections: REPORT_SECTIONS,
        includeNotes: false,
      },
      ctx.now(),
    );
    expect(report?.summary.walks).toBeGreaterThan(5);
    db.close();
  });

  it('a track written and a walk finished: rows come back as objects, many at once', () => {
    const { db, ctx } = opened();
    const dog = createDog(db, ctx, { name: 'Фрэнни' });
    const walk = startWalk(db, ctx, { dogId: dog.id });
    const start = ctx.now();
    appendTrackPoints(
      db,
      walk.id,
      Array.from({ length: 200 }, (_, i) => ({
        ts: start + i * 5000,
        lat: 55 + i * 0.00005,
        lon: 37,
        accuracyM: 5,
        speedMps: 1.3,
      })),
    );
    finishWalk(db, ctx, walk.id, start + 1_000_000);
    const rows = db.all('SELECT COUNT(*) AS n FROM track_point WHERE walk_id = ?', [walk.id]);
    expect(rows[0]?.['n']).toBe(200);
    expect(db.run('UPDATE walk SET notes = ? WHERE id = ?', ['x', walk.id]).changes).toBe(1);
    db.close();
  });

  it('a failed transaction is rolled back, nested ones to their own savepoint', () => {
    const { db } = opened();
    db.exec('CREATE TABLE t (n INTEGER)');
    expect(() => {
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (?)', [1]);
        db.transaction(() => {
          db.run('INSERT INTO t VALUES (?)', [2]);
          throw new Error('inner');
        });
      });
    }).toThrow('inner');
    expect(db.all('SELECT COUNT(*) AS n FROM t')[0]?.['n']).toBe(0);
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (?)', [3]);
      try {
        db.transaction(() => {
          db.run('INSERT INTO t VALUES (?)', [4]);
          throw new Error('inner');
        });
      } catch {
        // only the inner one is undone
      }
    });
    expect(db.all('SELECT n FROM t')).toEqual([{ n: 3 }]);
  });

  it('bytes survive a round trip: the demo can be saved in the browser and opened again', () => {
    const { db } = opened();
    db.exec('CREATE TABLE blobs (id INTEGER, data BLOB)');
    db.run('INSERT INTO blobs VALUES (?, ?)', [1, new Uint8Array([1, 2, 3])]);
    db.runMany('INSERT INTO blobs VALUES (?, ?)', [
      [2, null],
      [3, 9n],
    ]);
    const copy = openSqlJsDb(engine, db.exportBytes());
    expect(copy.all('SELECT id, data FROM blobs ORDER BY id')).toEqual([
      { id: 1, data: new Uint8Array([1, 2, 3]) },
      { id: 2, data: null },
      { id: 3, data: 9 },
    ]);
    db.close();
    copy.close();
  });
});
