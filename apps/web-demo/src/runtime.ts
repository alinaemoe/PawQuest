import {
  MIGRATIONS,
  configureConnection,
  createCtx,
  createDog,
  migrate,
  seedDemoData,
  setSetting,
  type Ctx,
  type SqlDb,
} from '@pawquest/data';
import { openSqlJsDb } from '@pawquest/data/sqljs';
import initSqlJs from 'sql.js';

export interface Runtime {
  readonly db: SqlDb;
  readonly ctx: Ctx;
}

let instance: Runtime | null = null;

/**
 * The web demo's database: SQLite compiled to WebAssembly, in memory, filled with the demo dog at
 * the start. Loading the engine is asynchronous, so it is done once before the first screen.
 */
export async function initRuntime(): Promise<void> {
  if (instance !== null) {
    return;
  }
  const engine = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  const db = openSqlJsDb(engine);
  configureConnection(db);
  const ctx = createCtx();
  migrate(db, MIGRATIONS, () => new Date(ctx.now()).toISOString());
  const dog = createDog(db, ctx, { name: 'Фрэнни', isDemo: true, size: 'medium' });
  seedDemoData(db, ctx, dog.id, 'ru');
  setSetting(db, ctx, 'activeDogId', dog.id);
  setSetting(db, ctx, 'language', 'ru');
  setSetting(db, ctx, 'onboardingDone', true);
  instance = { db, ctx };
}

export function getRuntime(): Runtime {
  if (instance === null) {
    throw new Error('the demo database is not ready');
  }
  return instance;
}

export function detectLanguage(): 'ru' | 'en' {
  return 'ru';
}
