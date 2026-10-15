import { fromIso, toIso, type Ctx } from './ids';
import type { SqlDb } from './sql';

/** Retention of deleted records before the trash is emptied (G-02). */
export const TRASH_DAYS = 30;

/** Tables with a `deleted_at` column and the SQL that names a row in the trash list. */
const TRASHABLE = {
  dog: 'name',
  walk: 'COALESCE(title, started_at)',
  event: 'COALESCE(note, type_id)',
  skill: 'name',
  training_session: 'started_at',
  symptom_log: 'symptom',
  weight_log: 'CAST(weight_g AS TEXT)',
  place: 'name',
  project: 'title',
  care_item: 'title',
  care_plan: 'title',
  reminder: 'title',
  food_log: 'ts',
} as const;

export type TrashTable = keyof typeof TRASHABLE;

export interface TrashItem {
  readonly table: TrashTable;
  readonly id: string;
  readonly label: string;
  readonly deletedAt: number;
}

function assertTable(table: string): asserts table is TrashTable {
  if (!(table in TRASHABLE)) {
    throw new Error(`Not a trashable table: ${table}`);
  }
}

/** Moves a record to the trash. Returns false when it does not exist or is already there. */
export function softDelete(db: SqlDb, ctx: Ctx, table: TrashTable, id: string): boolean {
  assertTable(table);
  const iso = toIso(ctx.now());
  return (
    db.run(
      `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [iso, iso, id],
    ).changes > 0
  );
}

/** The "Undo" of the delete toast (G-02). */
export function restore(db: SqlDb, ctx: Ctx, table: TrashTable, id: string): boolean {
  assertTable(table);
  return (
    db.run(
      `UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`,
      [toIso(ctx.now()), id],
    ).changes > 0
  );
}

/** Everything in the trash, most recently deleted first. */
export function listTrash(db: SqlDb): TrashItem[] {
  const tables = Object.keys(TRASHABLE) as TrashTable[];
  const sql = tables
    .map(
      (table) =>
        `SELECT '${table}' AS tbl, id, ${TRASHABLE[table]} AS label, deleted_at FROM ${table} WHERE deleted_at IS NOT NULL`,
    )
    .join(' UNION ALL ');
  return db.all(`${sql} ORDER BY deleted_at DESC, id`).map((row) => ({
    table: String(row['tbl']) as TrashTable,
    id: String(row['id']),
    label: String(row['label']),
    deletedAt: fromIso(String(row['deleted_at'])),
  }));
}

/** Permanently removes records deleted more than `TRASH_DAYS` ago. Returns how many were removed. */
export function purgeExpiredTrash(db: SqlDb, ctx: Ctx, days: number = TRASH_DAYS): number {
  const cutoff = toIso(ctx.now() - days * 86_400_000);
  let removed = 0;
  db.transaction(() => {
    for (const table of Object.keys(TRASHABLE) as TrashTable[]) {
      removed += db.run(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [
        cutoff,
      ]).changes;
    }
  });
  return removed;
}

/** "Empty trash" in Settings -> Data: removes everything in it now. */
export function emptyTrash(db: SqlDb): number {
  let removed = 0;
  db.transaction(() => {
    for (const table of Object.keys(TRASHABLE) as TrashTable[]) {
      removed += db.run(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`).changes;
    }
  });
  return removed;
}
