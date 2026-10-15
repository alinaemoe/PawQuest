import { expectFound, fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow, SqlValue } from './sql';

export type CareKind =
  'vaccination' | 'parasite' | 'vet_visit' | 'grooming' | 'medication' | 'other';
export type CareSubtype = 'deworm' | 'tick_flea' | 'combined';
export type VisitReason = 'checkup' | 'vaccination' | 'problem' | 'followup' | 'other';

/** Ready-made routines (docs/17 §17.2). Off until the owner switches them on. */
export interface CareTemplate {
  readonly key: string;
  readonly kind: CareKind;
  readonly subtype: CareSubtype | null;
  readonly intervalDays: number | null;
  readonly intervalMonths: number | null;
  readonly seasonFromMonth: number | null;
  readonly seasonToMonth: number | null;
  readonly remindDaysBefore: readonly number[];
}

export const CARE_TEMPLATES: readonly CareTemplate[] = [
  {
    key: 'deworm',
    kind: 'parasite',
    subtype: 'deworm',
    intervalDays: null,
    intervalMonths: 3,
    seasonFromMonth: null,
    seasonToMonth: null,
    remindDaysBefore: [7, 0],
  },
  {
    key: 'tick_flea',
    kind: 'parasite',
    subtype: 'tick_flea',
    intervalDays: 30,
    intervalMonths: null,
    seasonFromMonth: 4,
    seasonToMonth: 10,
    remindDaysBefore: [3, 0],
  },
  {
    key: 'vaccination',
    kind: 'vaccination',
    subtype: null,
    intervalDays: null,
    intervalMonths: 12,
    seasonFromMonth: null,
    seasonToMonth: null,
    remindDaysBefore: [30, 7, 0],
  },
  {
    key: 'checkup',
    kind: 'vet_visit',
    subtype: null,
    intervalDays: null,
    intervalMonths: 12,
    seasonFromMonth: null,
    seasonToMonth: null,
    remindDaysBefore: [14, 0],
  },
];

export interface CarePlan {
  readonly id: string;
  readonly dogId: string;
  readonly templateKey: string | null;
  readonly kind: CareKind;
  readonly subtype: CareSubtype | null;
  readonly title: string;
  readonly intervalDays: number | null;
  readonly intervalMonths: number | null;
  readonly seasonFromMonth: number | null;
  readonly seasonToMonth: number | null;
  readonly remindDaysBefore: readonly number[];
  readonly defaultProduct: string | null;
  readonly enabled: boolean;
}

export interface PlanInput {
  readonly dogId: string;
  readonly templateKey?: string | null;
  readonly kind: CareKind;
  readonly subtype?: CareSubtype | null;
  readonly title: string;
  readonly intervalDays?: number | null;
  readonly intervalMonths?: number | null;
  readonly seasonFromMonth?: number | null;
  readonly seasonToMonth?: number | null;
  readonly remindDaysBefore?: readonly number[];
  readonly defaultProduct?: string | null;
}

export interface PlanWithLast extends CarePlan {
  readonly lastDoneAt: number | null;
  readonly lastProduct: string | null;
}

export interface CareItem {
  readonly id: string;
  readonly dogId: string;
  readonly kind: CareKind;
  readonly subtype: CareSubtype | null;
  readonly title: string;
  readonly doneAt: number | null;
  readonly nextDue: number | null;
  readonly product: string | null;
  readonly dose: string | null;
  readonly visitReason: VisitReason | null;
  readonly clinic: string | null;
  readonly findings: string | null;
  readonly prescription: string | null;
  readonly costMinor: number | null;
  readonly planId: string | null;
  readonly notes: string | null;
}

export interface CareLogInput {
  readonly dogId: string;
  readonly kind: CareKind;
  readonly subtype?: CareSubtype | null;
  readonly title: string;
  readonly doneAt: number;
  readonly planId?: string | null;
  readonly product?: string | null;
  readonly dose?: string | null;
  readonly visitReason?: VisitReason | null;
  readonly clinic?: string | null;
  readonly findings?: string | null;
  readonly prescription?: string | null;
  readonly costMinor?: number | null;
  readonly nextDue?: number | null;
  readonly notes?: string | null;
  readonly isDemo?: boolean;
}

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);

function parseDays(text: unknown): number[] {
  try {
    const value: unknown = JSON.parse(String(text));
    return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

function toPlan(row: SqlRow): CarePlan {
  return {
    id: String(row['id']),
    dogId: String(row['dog_id']),
    templateKey: str(row['template_key']),
    kind: String(row['kind']) as CareKind,
    subtype: str(row['subtype']) as CareSubtype | null,
    title: String(row['title']),
    intervalDays: num(row['interval_days']),
    intervalMonths: num(row['interval_months']),
    seasonFromMonth: num(row['season_from_month']),
    seasonToMonth: num(row['season_to_month']),
    remindDaysBefore: parseDays(row['remind_days_before']),
    defaultProduct: str(row['default_product']),
    enabled: row['enabled'] === 1,
  };
}

function toItem(row: SqlRow): CareItem {
  const done = str(row['done_at']);
  const next = str(row['next_due']);
  return {
    id: String(row['id']),
    dogId: String(row['dog_id']),
    kind: String(row['kind']) as CareKind,
    subtype: str(row['subtype']) as CareSubtype | null,
    title: String(row['title']),
    doneAt: done === null ? null : fromIso(done),
    nextDue: next === null ? null : fromIso(next),
    product: str(row['product']),
    dose: str(row['dose']),
    visitReason: str(row['visit_reason']) as VisitReason | null,
    clinic: str(row['clinic']),
    findings: str(row['findings']),
    prescription: str(row['prescription']),
    costMinor: num(row['cost_minor']),
    planId: str(row['plan_id']),
    notes: str(row['notes']),
  };
}

export function createPlan(db: SqlDb, ctx: Ctx, input: PlanInput): CarePlan {
  const title = input.title.trim();
  if (title === '') {
    throw new Error('A care plan needs a title');
  }
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO care_plan
       (id, dog_id, template_key, kind, subtype, title, interval_days, interval_months,
        season_from_month, season_to_month, remind_days_before, default_product, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.dogId,
      input.templateKey ?? null,
      input.kind,
      input.subtype ?? null,
      title,
      input.intervalDays ?? null,
      input.intervalMonths ?? null,
      input.seasonFromMonth ?? null,
      input.seasonToMonth ?? null,
      JSON.stringify(input.remindDaysBefore ?? [7, 0]),
      input.defaultProduct ?? null,
      nowIso,
      nowIso,
    ],
  );
  return expectFound(getPlan(db, id), 'care plan');
}

export function getPlan(db: SqlDb, id: string): CarePlan | null {
  const row = db.all('SELECT * FROM care_plan WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toPlan(row);
}

export function setPlanEnabled(db: SqlDb, ctx: Ctx, id: string, enabled: boolean): void {
  db.run('UPDATE care_plan SET enabled = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
    enabled ? 1 : 0,
    toIso(ctx.now()),
    id,
  ]);
}

export function setPlanProduct(db: SqlDb, ctx: Ctx, id: string, product: string | null): void {
  db.run(
    'UPDATE care_plan SET default_product = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [product, toIso(ctx.now()), id],
  );
}

/** Plans of a dog with the date and product of the last time each one was done. */
export function listPlans(db: SqlDb, dogId: string): PlanWithLast[] {
  return db
    .all(
      `SELECT p.*,
              (SELECT MAX(i.done_at) FROM care_item i
                WHERE i.plan_id = p.id AND i.deleted_at IS NULL) AS last_done,
              (SELECT i.product FROM care_item i
                WHERE i.plan_id = p.id AND i.deleted_at IS NULL
                ORDER BY i.done_at DESC LIMIT 1) AS last_product
         FROM care_plan p
        WHERE p.dog_id = ? AND p.deleted_at IS NULL
        ORDER BY p.created_at, p.id`,
      [dogId],
    )
    .map((row) => {
      const last = str(row['last_done']);
      return {
        ...toPlan(row),
        lastDoneAt: last === null ? null : fromIso(last),
        lastProduct: str(row['last_product']),
      };
    });
}

/** Records that something was done (a treatment, a vaccination, a vet visit). */
export function logCare(db: SqlDb, ctx: Ctx, input: CareLogInput): CareItem {
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO care_item
       (id, dog_id, kind, subtype, title, done_at, next_due, notes, product, dose, visit_reason,
        clinic, findings, prescription, cost_minor, plan_id, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.dogId,
      input.kind,
      input.subtype ?? null,
      input.title.trim(),
      toIso(input.doneAt),
      input.nextDue === undefined || input.nextDue === null ? null : toIso(input.nextDue),
      input.notes ?? null,
      input.product ?? null,
      input.dose ?? null,
      input.visitReason ?? null,
      input.clinic ?? null,
      input.findings ?? null,
      input.prescription ?? null,
      input.costMinor ?? null,
      input.planId ?? null,
      input.isDemo === true ? 1 : 0,
      nowIso,
      nowIso,
    ],
  );
  return expectFound(getCareItem(db, id), 'care item');
}

export function getCareItem(db: SqlDb, id: string): CareItem | null {
  const row = db.all('SELECT * FROM care_item WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toItem(row);
}

/** Care records of a dog, newest first, optionally of one kind. */
export function listCareItems(
  db: SqlDb,
  dogId: string,
  limit: number,
  kind?: CareKind,
  before?: number,
): CareItem[] {
  return db
    .all(
      `SELECT * FROM care_item
        WHERE dog_id = ? AND deleted_at IS NULL AND done_at IS NOT NULL AND done_at < ?
          AND (? IS NULL OR kind = ?)
        ORDER BY done_at DESC, id DESC LIMIT ?`,
      [dogId, toIso(before ?? 8_000_000_000_000), kind ?? null, kind ?? null, limit],
    )
    .map(toItem);
}

/** Dates a routine was done, oldest first: input for the real-interval statistics. */
export function careDates(
  db: SqlDb,
  dogId: string,
  kind: CareKind,
  subtype?: CareSubtype,
): number[] {
  return db
    .all(
      `SELECT done_at FROM care_item
        WHERE dog_id = ? AND kind = ? AND (? IS NULL OR subtype = ?)
          AND deleted_at IS NULL AND done_at IS NOT NULL
        ORDER BY done_at`,
      [dogId, kind, subtype ?? null, subtype ?? null],
    )
    .map((row) => fromIso(String(row['done_at'])));
}

/** Names used before (a clinic, a product), most recent first, for one-tap reuse. */
export function recentValues(
  db: SqlDb,
  dogId: string,
  column: 'product' | 'clinic',
  limit = 5,
): string[] {
  return db
    .all(
      `SELECT ${column} AS v, MAX(done_at) AS last FROM care_item
        WHERE dog_id = ? AND deleted_at IS NULL AND ${column} IS NOT NULL AND ${column} <> ''
        GROUP BY ${column} ORDER BY last DESC LIMIT ?`,
      [dogId, limit],
    )
    .map((row) => String(row['v']));
}

/** Number of vet visits and how many of them were because of a problem, in a period. */
export function visitCounts(
  db: SqlDb,
  dogId: string,
  fromTs: number,
  toTs: number,
): { readonly total: number; readonly problem: number } {
  const row = db.all(
    `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN visit_reason = 'problem' THEN 1 ELSE 0 END), 0) AS p
       FROM care_item
      WHERE dog_id = ? AND kind = 'vet_visit' AND deleted_at IS NULL
        AND done_at >= ? AND done_at < ?`,
    [dogId, toIso(fromTs), toIso(toTs)],
  )[0];
  return { total: Number(row?.['n'] ?? 0), problem: Number(row?.['p'] ?? 0) };
}
