import {
  MIGRATIONS,
  configureConnection,
  createCtx,
  migrate,
  type Ctx,
  type SqlDb,
} from '@pawquest/data';
import { openExpoDb } from '@pawquest/data/expo';

export interface Runtime {
  readonly db: SqlDb;
  readonly ctx: Ctx;
}

let instance: Runtime | null = null;

/**
 * The one database connection of the app. Opening it also applies pending migrations, so every
 * screen can assume the schema is current. Created lazily and kept for the process lifetime.
 */
export function getRuntime(): Runtime {
  if (instance === null) {
    const db = openExpoDb('pawquest.db');
    configureConnection(db);
    const ctx = createCtx();
    migrate(db, MIGRATIONS, () => new Date(ctx.now()).toISOString());
    instance = { db, ctx };
  }
  return instance;
}

/** Language to start with: the phone's, when it is English; Russian otherwise. */
export function detectLanguage(): 'ru' | 'en' {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.toLowerCase().startsWith('en') ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}
