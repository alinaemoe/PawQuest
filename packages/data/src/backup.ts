import type { SqlDb, SqlValue } from './sql';

/**
 * The full backup of the database as one JSON document (docs/23, step 3.12): every table with its
 * rows, so that what was exported can be put back into an empty database and give the same data.
 * The caches that are worked out again (`walk_derived`) and the migration bookkeeping are not part
 * of it. The file is written in chunks, so a year of tracks does not have to fit in memory.
 */

export const BACKUP_FORMAT = 'pawquest-backup';
export const BACKUP_VERSION = 1;

/** Tables that are not data of the owner: they are rebuilt or belong to the database itself. */
const SKIPPED_TABLES = new Set(['walk_derived', 'schema_migrations']);
const BATCH = 2000;

export function backupTables(db: SqlDb): string[] {
  return db
    .all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((r) => String(r['name']))
    .filter((name) => !SKIPPED_TABLES.has(name));
}

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

function columnsOf(db: SqlDb, table: string): string[] {
  return db.all(`PRAGMA table_info(${quote(table)})`).map((r) => String(r['name']));
}

function schemaVersion(db: SqlDb): number {
  const row = db.all('SELECT MAX(version) AS v FROM schema_migrations')[0];
  return Number(row?.['v'] ?? 0);
}

/** The backup as a sequence of JSON pieces; joined they are one document. */
export function* backupChunks(db: SqlDb, now: number): Generator<string> {
  yield `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${String(BACKUP_VERSION)},"schemaVersion":${String(schemaVersion(db))},"exportedAt":${JSON.stringify(new Date(now).toISOString())},"tables":{`;
  let firstTable = true;
  for (const table of backupTables(db)) {
    const columns = columnsOf(db, table);
    yield `${firstTable ? '' : ','}${JSON.stringify(table)}:{"columns":${JSON.stringify(columns)},"rows":[`;
    firstTable = false;
    let after = 0;
    let firstRow = true;
    for (;;) {
      const rows = db.all(
        `SELECT rowid AS __rowid, * FROM ${quote(table)} WHERE rowid > ? ORDER BY rowid LIMIT ${String(BATCH)}`,
        [after],
      );
      if (rows.length === 0) {
        break;
      }
      const lines: string[] = [];
      for (const row of rows) {
        lines.push(JSON.stringify(columns.map((c) => encodeValue(row[c] as SqlValue))));
      }
      yield `${firstRow ? '' : ','}${lines.join(',')}`;
      firstRow = false;
      after = Number(rows[rows.length - 1]?.['__rowid']);
    }
    yield ']}';
  }
  yield '}}';
}

/** The whole backup as one string (for small databases and tests). */
export function exportBackup(db: SqlDb, now: number): string {
  return [...backupChunks(db, now)].join('');
}

/** A value as JSON carries it. The database has no blob columns; one would be a mistake to notice. */
function encodeValue(value: SqlValue): string | number | null {
  if (value instanceof Uint8Array) {
    throw new Error('A blob cannot be put in a backup');
  }
  // the drivers of the app give numbers, not bigints
  return value as string | number | null;
}

export interface BackupSummary {
  readonly exportedAt: string;
  readonly schemaVersion: number;
  /** Rows by table. */
  readonly rows: Readonly<Record<string, number>>;
}

interface ParsedBackup {
  readonly exportedAt: string;
  readonly schemaVersion: number;
  readonly tables: Readonly<Record<string, { columns: string[]; rows: unknown[][] }>>;
}

/** Reads and checks a backup document; throws a readable error when it is not one of ours. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a PawQuest backup (the file is not readable)');
  }
  const doc = data as Record<string, unknown> | null;
  if (doc === null || typeof doc !== 'object' || doc['format'] !== BACKUP_FORMAT) {
    throw new Error('This is not a PawQuest backup');
  }
  if (doc['version'] !== BACKUP_VERSION) {
    throw new Error('This backup is of a version this app does not know');
  }
  const tables = doc['tables'];
  if (typeof tables !== 'object' || tables === null) {
    throw new Error('The backup has no tables');
  }
  return {
    exportedAt: String(doc['exportedAt']),
    schemaVersion: Number(doc['schemaVersion']),
    tables: tables as ParsedBackup['tables'],
  };
}

export function summarizeBackup(text: string): BackupSummary {
  const backup = parseBackup(text);
  return {
    exportedAt: backup.exportedAt,
    schemaVersion: backup.schemaVersion,
    rows: Object.fromEntries(
      Object.entries(backup.tables).map(([name, t]) => [name, t.rows.length]),
    ),
  };
}

/**
 * Puts a backup back: the data tables are emptied and filled from the document, in one
 * transaction (a backup that cannot be read leaves the database as it was). A backup made by a
 * newer version of the app is refused; columns this app does not have are skipped, columns the
 * backup does not have get their defaults.
 */
export function restoreBackup(db: SqlDb, text: string): BackupSummary {
  const backup = parseBackup(text);
  if (backup.schemaVersion > schemaVersion(db)) {
    throw new Error('This backup was made by a newer version of the app');
  }
  const known = new Set(backupTables(db));
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of known) {
        db.run(`DELETE FROM ${quote(table)}`);
      }
      for (const [table, data] of Object.entries(backup.tables)) {
        if (!known.has(table)) {
          continue;
        }
        const have = new Set(columnsOf(db, table));
        const use = data.columns.map((c, i) => ({ c, i })).filter(({ c }) => have.has(c));
        if (use.length === 0) {
          continue;
        }
        const sql = `INSERT INTO ${quote(table)} (${use.map(({ c }) => quote(c)).join(', ')}) VALUES (${use.map(() => '?').join(', ')})`;
        db.runMany(
          sql,
          data.rows.map((row) => use.map(({ i }) => row[i] as SqlValue)),
        );
      }
      const broken = db.all('PRAGMA foreign_key_check');
      if (broken.length > 0) {
        throw new Error('The backup has rows that point to rows that are not there');
      }
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return summarizeBackup(text);
}
