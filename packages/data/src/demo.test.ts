import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteDemoData, hidePrompt, isPromptHidden, seedDemoData } from './demo';
import { createDog } from './dogs';
import { createEvent } from './events';
import { recentFeed } from './feed';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk, lastCompletedWalk } from './walks';
import { latestWeight } from './weights';

const DAY = 86_400_000;
let env: TestEnv;
beforeEach(() => {
  env = testEnv();
});
afterEach(() => {
  env.db.close();
});

const count = (table: string): number =>
  Number(env.db.all(`SELECT COUNT(*) AS n FROM ${table}`)[0]?.['n']);

describe('demo data', () => {
  it('fills a believable fortnight, all flagged as demo', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Демо', isDemo: true });
    seedDemoData(env.db, env.ctx, dog.id);
    expect(count('walk')).toBe(9);
    expect(count('event')).toBe(5);
    expect(count('weight_log')).toBe(2);
    expect(env.db.all('SELECT COUNT(*) AS n FROM walk WHERE is_demo = 0')[0]).toEqual({ n: 0 });
    expect(env.db.all('SELECT COUNT(*) AS n FROM event WHERE is_demo = 0')[0]).toEqual({ n: 0 });
    expect(lastCompletedWalk(env.db, dog.id)?.durationS).toBe(32 * 60);
    expect(latestWeight(env.db, dog.id)?.weightG).toBe(6180);
    expect(recentFeed(env.db, dog.id, 5)).toHaveLength(5);
  });

  it('notes follow the chosen language', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Demo', isDemo: true });
    seedDemoData(env.db, env.ctx, dog.id, 'en');
    const notes = env.db
      .all('SELECT note FROM event WHERE note IS NOT NULL')
      .map((r) => String(r['note']));
    expect(notes).toContain('cyclist from behind');
    expect(notes.some((n) => /[а-я]/i.test(n))).toBe(false);
  });

  it('the demo walks all lie in the past and within two weeks', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Демо', isDemo: true });
    seedDemoData(env.db, env.ctx, dog.id);
    for (const row of env.db.all('SELECT started_at FROM walk')) {
      const at = Date.parse(String(row['started_at']));
      expect(at).toBeLessThan(START);
      expect(at).toBeGreaterThan(START - 14 * DAY);
    }
  });

  it('deleteDemoData removes demo records and the demo dog but keeps real ones', () => {
    const real = createDog(env.db, env.ctx, { name: 'Фрэнни' });
    const demo = createDog(env.db, env.ctx, { name: 'Демо', isDemo: true });
    createManualWalk(env.db, env.ctx, { dogId: real.id, startedAt: START, durationS: 600 });
    createEvent(env.db, env.ctx, { dogId: real.id, typeId: 'note', note: 'моё' });
    seedDemoData(env.db, env.ctx, demo.id);

    expect(deleteDemoData(env.db)).toBeGreaterThan(15);
    expect(count('dog')).toBe(1);
    expect(count('walk')).toBe(1);
    expect(count('event')).toBe(1);
    expect(count('weight_log')).toBe(0);
    expect(count('walk_dog')).toBe(1);
  });

  it('deleting demo data on an empty database is a no-op', () => {
    expect(deleteDemoData(env.db)).toBe(0);
  });
});

describe('hidden prompts', () => {
  it('a prompt is hidden until the given moment and then shows again', () => {
    expect(isPromptHidden(env.db, 'weight', START)).toBe(false);
    hidePrompt(env.db, env.ctx, 'weight', START + DAY);
    expect(isPromptHidden(env.db, 'weight', START)).toBe(true);
    expect(isPromptHidden(env.db, 'weight', START + DAY - 1)).toBe(true);
    expect(isPromptHidden(env.db, 'weight', START + DAY)).toBe(false);
  });

  it('hiding again replaces the deadline', () => {
    hidePrompt(env.db, env.ctx, 'weight', START + DAY);
    hidePrompt(env.db, env.ctx, 'weight', START + 14 * DAY);
    expect(isPromptHidden(env.db, 'weight', START + 7 * DAY)).toBe(true);
    expect(count('prompt_state')).toBe(1);
  });

  it('prompts are independent', () => {
    hidePrompt(env.db, env.ctx, 'weight', START + DAY);
    expect(isPromptHidden(env.db, 'profile', START)).toBe(false);
  });
});
