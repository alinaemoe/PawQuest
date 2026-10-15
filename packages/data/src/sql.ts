/** A value that can be bound to a SQL parameter or read back from a row. */
export type SqlValue = string | number | bigint | null | Uint8Array;

export type SqlRow = Record<string, SqlValue>;

/**
 * The small synchronous surface the data layer needs from SQLite. `expo-sqlite` implements it on
 * the device and `node:sqlite` in tests, so the same migration and repository code runs in both.
 */
export interface SqlDb {
  /** Runs one or more statements without parameters (DDL, pragmas). */
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): { readonly changes: number };
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  /** Runs one prepared statement once per row of parameters. Call inside a transaction for speed. */
  runMany(sql: string, rows: readonly (readonly SqlValue[])[]): void;
  /** Commits when `fn` returns, rolls back when it throws. Nested calls become savepoints. */
  transaction<T>(fn: () => T): T;
}

/**
 * Transaction handling shared by every adapter: the outermost call is BEGIN/COMMIT, nested calls
 * are savepoints, and any throw rolls back exactly its own level.
 */
export function createTransaction(exec: (sql: string) => void): <T>(fn: () => T) => T {
  let depth = 0;
  return <T>(fn: () => T): T => {
    const name = `pq_sp_${String(depth)}`;
    exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (error) {
      depth -= 1;
      exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
  };
}

/** Foreign keys on and WAL journal (spec 08 §8.1). Must run outside a transaction. */
export function configureConnection(db: SqlDb): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
}
