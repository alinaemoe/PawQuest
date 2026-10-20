import type { BindParams, Database, SqlJsStatic } from 'sql.js';

import { createTransaction, type SqlDb, type SqlRow, type SqlValue } from '../sql';

export interface SqlJsDb extends SqlDb {
  /** The whole database as bytes, for saving it in the browser. */
  exportBytes(): Uint8Array;
  close(): void;
}

const bind = (params: readonly SqlValue[]): BindParams =>
  params.map((v) => (typeof v === 'bigint' ? Number(v) : v));

/**
 * SqlDb on sql.js (SQLite compiled to WebAssembly) for the web demo. Its API is synchronous, like
 * expo-sqlite's, so the same repositories and migrations run in the browser unchanged. The caller
 * loads the engine once (`initSqlJs`) and hands it in, so this file pulls nothing into the app.
 */
export function openSqlJsDb(engine: SqlJsStatic, bytes?: Uint8Array): SqlJsDb {
  const db: Database = new engine.Database(bytes);
  const exec = (sql: string): void => {
    db.exec(sql);
  };
  return {
    exec,
    run(sql, params = []) {
      db.run(sql, bind(params));
      return { changes: db.getRowsModified() };
    },
    all(sql, params = []) {
      const statement = db.prepare(sql);
      try {
        statement.bind(bind(params));
        const rows: SqlRow[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    },
    runMany(sql, rows) {
      const statement = db.prepare(sql);
      try {
        for (const row of rows) {
          statement.run(bind(row));
        }
      } finally {
        statement.free();
      }
    },
    transaction: createTransaction(exec),
    exportBytes: () => db.export(),
    close() {
      db.close();
    },
  };
}
