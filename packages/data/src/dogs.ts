import { expectFound, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow } from './sql';

export type Sex = 'female' | 'male' | 'unknown';
export type DogSize = 'small' | 'medium' | 'large' | 'giant';

export interface Dog {
  readonly id: string;
  readonly name: string;
  readonly photoUri: string | null;
  /** 'YYYY-MM-DD' */
  readonly birthDate: string | null;
  readonly approxAgeMonths: number | null;
  readonly sex: Sex | null;
  readonly size: DogSize | null;
  readonly breed: string | null;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly isDemo: boolean;
}

export interface DogInput {
  readonly name: string;
  readonly photoUri?: string | null;
  readonly birthDate?: string | null;
  readonly approxAgeMonths?: number | null;
  readonly sex?: Sex | null;
  readonly size?: DogSize | null;
  readonly breed?: string | null;
  readonly notes?: string | null;
  readonly isDemo?: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function toDog(row: SqlRow): Dog {
  return {
    id: String(row['id']),
    name: String(row['name']),
    photoUri: str(row['photo_uri']),
    birthDate: str(row['birth_date']),
    approxAgeMonths: num(row['approx_age_months']),
    sex: str(row['sex']) as Sex | null,
    size: str(row['size']) as DogSize | null,
    breed: str(row['breed']),
    notes: str(row['notes']),
    archived: row['archived'] === 1,
    isDemo: row['is_demo'] === 1,
  };
}

export function createDog(db: SqlDb, ctx: Ctx, input: DogInput): Dog {
  const name = input.name.trim();
  if (name === '') {
    throw new Error('A dog needs a name');
  }
  const id = ctx.newId();
  const now = toIso(ctx.now());
  db.run(
    `INSERT INTO dog (id, name, photo_uri, birth_date, approx_age_months, sex, size, breed, notes, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      input.photoUri ?? null,
      input.birthDate ?? null,
      input.approxAgeMonths ?? null,
      input.sex ?? null,
      input.size ?? null,
      input.breed ?? null,
      input.notes ?? null,
      input.isDemo === true ? 1 : 0,
      now,
      now,
    ],
  );
  return expectFound(getDog(db, id), 'dog');
}

export function getDog(db: SqlDb, id: string): Dog | null {
  const row = db.all('SELECT * FROM dog WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toDog(row);
}

/** Dogs that are neither archived nor in the trash, oldest first. */
export function listDogs(db: SqlDb): Dog[] {
  return db
    .all('SELECT * FROM dog WHERE deleted_at IS NULL AND archived = 0 ORDER BY created_at, id')
    .map(toDog);
}

export function updateDog(
  db: SqlDb,
  ctx: Ctx,
  id: string,
  changes: Partial<Omit<DogInput, 'isDemo'>>,
): Dog | null {
  const columns: Record<keyof Omit<DogInput, 'isDemo'>, string> = {
    name: 'name',
    photoUri: 'photo_uri',
    birthDate: 'birth_date',
    approxAgeMonths: 'approx_age_months',
    sex: 'sex',
    size: 'size',
    breed: 'breed',
    notes: 'notes',
  };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = changes[key as keyof typeof columns];
    if (value !== undefined) {
      if (key === 'name' && String(value).trim() === '') {
        throw new Error('A dog needs a name');
      }
      sets.push(`${column} = ?`);
      params.push(key === 'name' ? String(value).trim() : value);
    }
  }
  if (sets.length > 0) {
    db.run(
      `UPDATE dog SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [...params, toIso(ctx.now()), id],
    );
  }
  return getDog(db, id);
}
