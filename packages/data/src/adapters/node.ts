import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createTransaction, type SqlDb } from '../sql';

/** SqlDb on Node's built-in SQLite. Used by tests and the desktop benchmark, never shipped in the app. */
export function openNodeDb(path = ':memory:'): SqlDb & { close(): void } {
  const db = new DatabaseSync(path);
  const exec = (sql: string): void => {
    db.exec(sql);
  };
  return {
    exec,
    run(sql, params = []) {
      const result = db.prepare(sql).run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes) };
    },
    all(sql, params = []) {
      return db.prepare(sql).all(...(params as SQLInputValue[]));
    },
    runMany(sql, rows) {
      const statement = db.prepare(sql);
      for (const row of rows) {
        statement.run(...(row as SQLInputValue[]));
      }
    },
    transaction: createTransaction(exec),
    close() {
      db.close();
    },
  };
}
