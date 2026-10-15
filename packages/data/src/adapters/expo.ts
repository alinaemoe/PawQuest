import { openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';

import { createTransaction, type SqlDb, type SqlRow } from '../sql';

export interface ExpoDb extends SqlDb {
  /** The underlying handle, for Drizzle's `drizzle(handle)`. */
  readonly handle: SQLiteDatabase;
}

/** SqlDb on expo-sqlite's synchronous API (the device implementation). */
export function wrapExpoDb(handle: SQLiteDatabase): ExpoDb {
  const exec = (sql: string): void => {
    handle.execSync(sql);
  };
  return {
    handle,
    exec,
    run(sql, params = []) {
      return { changes: handle.runSync(sql, params as SQLiteBindValue[]).changes };
    },
    all(sql, params = []) {
      return handle.getAllSync<SqlRow>(sql, params as SQLiteBindValue[]);
    },
    runMany(sql, rows) {
      const statement = handle.prepareSync(sql);
      try {
        for (const row of rows) {
          statement.executeSync(row as SQLiteBindValue[]).resetSync();
        }
      } finally {
        statement.finalizeSync();
      }
    },
    transaction: createTransaction(exec),
  };
}

export function openExpoDb(name: string): ExpoDb {
  return wrapExpoDb(openDatabaseSync(name));
}
