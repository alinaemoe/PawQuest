import { createEvent } from './events';
import { toIso, type Ctx } from './ids';
import type { SqlDb } from './sql';
import { createManualWalk } from './walks';
import { addWeight } from './weights';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * Fills the demo dog with a believable fortnight (spec S00-1): walks of varying length, a few
 * observations and weighings. Everything is flagged `is_demo` so one button can remove it.
 */
export function seedDemoData(
  db: SqlDb,
  ctx: Ctx,
  dogId: string,
  language: 'ru' | 'en' = 'ru',
): void {
  const ru = language === 'ru';
  const now = ctx.now();
  db.transaction(() => {
    const walks: readonly (readonly [number, number, number, number])[] = [
      // [days ago, hour of day offset, minutes, km]
      [0, -4, 32, 2.1],
      [1, -2, 41, 2.6],
      [1, -10, 24, 1.4],
      [2, -3, 55, 3.4],
      [4, -5, 28, 1.7],
      [5, -2, 47, 2.9],
      [7, -6, 36, 2.2],
      [9, -4, 30, 1.9],
      [11, -3, 62, 4.1],
    ];
    for (const [daysAgo, hours, minutes, km] of walks) {
      createManualWalk(db, ctx, {
        dogId,
        startedAt: now - daysAgo * DAY + hours * HOUR,
        durationS: minutes * 60,
        distanceM: Math.round(km * 1000),
        mood: 4,
        isDemo: true,
      });
    }
    const events: readonly (readonly [string, number, string | null])[] = [
      ['hard', 1, ru ? 'велосипедист сзади' : 'cyclist from behind'],
      ['dog', 2, null],
      ['success', 2, ru ? 'подошла с первого раза' : 'came on the first call'],
      ['note', 6, ru ? 'новый маршрут вдоль реки' : 'new route along the river'],
      ['toilet', 0, null],
    ];
    for (const [typeId, daysAgo, note] of events) {
      createEvent(db, ctx, {
        dogId,
        typeId,
        ts: now - daysAgo * DAY - HOUR,
        note,
        incomplete: typeId === 'hard' || typeId === 'dog',
        isDemo: true,
      });
    }
    addWeight(db, ctx, { dogId, weightG: 6050, measuredAt: now - 40 * DAY, isDemo: true });
    addWeight(db, ctx, { dogId, weightG: 6180, measuredAt: now - 19 * DAY, isDemo: true });
  });
}

/** Removes every record flagged as demo, the demo dog included. Returns how many rows went. */
export function deleteDemoData(db: SqlDb): number {
  let removed = 0;
  db.transaction(() => {
    for (const table of ['event', 'weight_log', 'training_session', 'symptom_log', 'walk', 'dog']) {
      removed += db.run(`DELETE FROM ${table} WHERE is_demo = 1`).changes;
    }
  });
  return removed;
}

/** Hides a soft prompt (weight card, ...) until a moment; null means shown. */
export function hidePrompt(db: SqlDb, ctx: Ctx, key: string, untilTs: number): void {
  db.run(
    `INSERT INTO prompt_state (key, last_shown_at, hidden_until) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET hidden_until = excluded.hidden_until`,
    [key, toIso(ctx.now()), toIso(untilTs)],
  );
}

export function isPromptHidden(db: SqlDb, key: string, now: number): boolean {
  const row = db.all('SELECT hidden_until FROM prompt_state WHERE key = ?', [key])[0];
  const until = row?.['hidden_until'];
  return typeof until === 'string' && Date.parse(until) > now;
}
