import { fromIso, toIso, type Ctx } from './ids';
import type { SqlDb } from './sql';

export type WeighConditions = 'morning' | 'before_meal' | 'after_walk' | 'other';

export interface WeightEntry {
  readonly id: string;
  readonly measuredAt: number;
  readonly weightG: number;
  readonly conditions: WeighConditions | null;
  readonly notes: string | null;
}

export function addWeight(
  db: SqlDb,
  ctx: Ctx,
  input: {
    readonly dogId: string;
    readonly weightG: number;
    readonly measuredAt?: number;
    readonly conditions?: WeighConditions | null;
    readonly notes?: string | null;
    readonly isDemo?: boolean;
  },
): WeightEntry {
  if (!Number.isFinite(input.weightG) || input.weightG <= 0) {
    throw new Error('Weight must be positive');
  }
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO weight_log (id, dog_id, measured_at, weight_g, conditions, notes, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.dogId,
      toIso(input.measuredAt ?? ctx.now()),
      Math.round(input.weightG),
      input.conditions ?? null,
      input.notes ?? null,
      input.isDemo === true ? 1 : 0,
      nowIso,
      nowIso,
    ],
  );
  return {
    id,
    measuredAt: input.measuredAt ?? ctx.now(),
    weightG: Math.round(input.weightG),
    conditions: input.conditions ?? null,
    notes: input.notes ?? null,
  };
}

/** The newest weighing of a dog, or null when it was never weighed. */
export function latestWeight(db: SqlDb, dogId: string): WeightEntry | null {
  const row = db.all(
    'SELECT * FROM weight_log WHERE dog_id = ? AND deleted_at IS NULL ORDER BY measured_at DESC, id DESC LIMIT 1',
    [dogId],
  )[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: String(row['id']),
    measuredAt: fromIso(String(row['measured_at'])),
    weightG: Number(row['weight_g']),
    conditions: (typeof row['conditions'] === 'string'
      ? row['conditions']
      : null) as WeighConditions | null,
    notes: typeof row['notes'] === 'string' ? row['notes'] : null,
  };
}

/**
 * Whether to show the "please weigh your dog" card (S01-Wt): the last weighing is older than the
 * interval, or there is none. The card itself is limited to once a day by the caller.
 */
export function isWeightDue(
  latest: WeightEntry | null,
  now: number,
  intervalDays: number,
): boolean {
  return latest === null || now - latest.measuredAt >= intervalDays * 86_400_000;
}
