import { openNodeDb } from './adapters/node';
import { createCtx, type Ctx } from './ids';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations.generated';
import { configureConnection, type SqlDb } from './sql';

/** Deterministic pseudo-random numbers in [0, 1) so ids are reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const START = Date.UTC(2026, 9, 15, 12, 0, 0);

export interface TestEnv {
  readonly db: SqlDb & { close(): void };
  readonly ctx: Ctx;
  /** Moves the test clock forward. */
  advance(ms: number): void;
  now(): number;
}

/** A migrated in-memory database plus a clock the test controls. */
export function testEnv(): TestEnv {
  const db = openNodeDb();
  configureConnection(db);
  let t = START;
  const ctx = createCtx(() => t, mulberry32(42));
  migrate(db, MIGRATIONS, () => new Date(t).toISOString());
  return {
    db,
    ctx,
    advance: (ms) => {
      t += ms;
    },
    now: () => t,
  };
}
