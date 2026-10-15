import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openNodeDb } from './adapters/node';
import { configureConnection } from './sql';

let db: ReturnType<typeof openNodeDb>;

beforeEach(() => {
  db = openNodeDb();
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
});
afterEach(() => {
  db.close();
});

const values = (): unknown[] => db.all('SELECT v FROM t ORDER BY id').map((r) => r['v']);

describe('SqlDb basics', () => {
  it('run reports changes and binds parameters', () => {
    expect(db.run('INSERT INTO t (v) VALUES (?)', ['a']).changes).toBe(1);
    expect(db.run('UPDATE t SET v = ? WHERE v = ?', ['b', 'zzz']).changes).toBe(0);
    expect(values()).toEqual(['a']);
  });

  it('all returns rows and works without parameters', () => {
    db.run('INSERT INTO t (v) VALUES (?)', ['x']);
    expect(db.all('SELECT v FROM t')).toEqual([{ v: 'x' }]);
    expect(db.all('SELECT v FROM t WHERE v = ?', ['nope'])).toEqual([]);
  });

  it('runMany runs one statement per parameter row', () => {
    db.runMany('INSERT INTO t (v) VALUES (?)', [['a'], ['b'], ['c']]);
    expect(values()).toEqual(['a', 'b', 'c']);
  });

  it('configureConnection turns foreign keys on', () => {
    configureConnection(db);
    expect(db.all('PRAGMA foreign_keys')[0]?.['foreign_keys']).toBe(1);
  });
});

describe('transaction', () => {
  it('commits and returns the callback result', () => {
    const result = db.transaction(() => {
      db.run('INSERT INTO t (v) VALUES (?)', ['a']);
      return 42;
    });
    expect(result).toBe(42);
    expect(values()).toEqual(['a']);
  });

  it('rolls back everything and rethrows when the callback throws', () => {
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t (v) VALUES (?)', ['a']);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(values()).toEqual([]);
  });

  it('rolls back only the inner level when an inner transaction fails and the outer catches it', () => {
    db.transaction(() => {
      db.run('INSERT INTO t (v) VALUES (?)', ['outer']);
      try {
        db.transaction(() => {
          db.run('INSERT INTO t (v) VALUES (?)', ['inner']);
          throw new Error('inner failed');
        });
      } catch {
        // the outer transaction continues
      }
      db.run('INSERT INTO t (v) VALUES (?)', ['after']);
    });
    expect(values()).toEqual(['outer', 'after']);
  });

  it('rolls back inner work too when the outer transaction later fails', () => {
    expect(() =>
      db.transaction(() => {
        db.transaction(() => db.run('INSERT INTO t (v) VALUES (?)', ['inner']));
        throw new Error('outer failed');
      }),
    ).toThrow('outer failed');
    expect(values()).toEqual([]);
  });

  it('is usable again after a failure (depth is reset)', () => {
    expect(() =>
      db.transaction(() => {
        throw new Error('x');
      }),
    ).toThrow();
    db.transaction(() => db.run('INSERT INTO t (v) VALUES (?)', ['ok']));
    expect(values()).toEqual(['ok']);
  });
});
