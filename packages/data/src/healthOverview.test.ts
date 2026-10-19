import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { healthOverview } from './healthOverview';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';
import { addWeight } from './weights';

const DAY = 86_400_000;
const NOW = START + 60 * DAY;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const walk = (day: number, minutes: number): string =>
  createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
  }).id;

describe('healthOverview', () => {
  it('weights, weeks, an unusual walk and a busy day, put together', () => {
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6000, measuredAt: START + 5 * DAY });
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6150, measuredAt: START + 35 * DAY });
    const minutes = [30, 32, 28, 35, 31, 29, 33, 30, 34, 31, 30, 32];
    minutes.forEach((m, i) => walk(30 + i * 2, m));
    walk(55, 4); // much shorter than the rest
    const busy = walk(58, 30);
    for (let i = 0; i < 6; i += 1) {
      createEvent(env.db, env.ctx, {
        dogId: dog.id,
        walkId: busy,
        typeId: 'dog',
        ts: START + 58 * DAY + i * 60_000,
        tzOffsetMin: 0,
        reaction: 5,
        incomplete: false,
      });
    }
    const overview = healthOverview(env.db, dog.id, NOW, 0);
    expect(overview.weight).toMatchObject({ latest: { grams: 6150 }, change30: 150 });
    expect(overview.weights).toHaveLength(2);
    expect(overview.weeks).toHaveLength(8);
    expect(overview.weeks.reduce((sum, w) => sum + w.walks, 0)).toBeGreaterThan(8);
    expect(overview.unusual.map((u) => u.kind)).toEqual(['short']);
    expect(overview.persistent).toBeNull();
    expect(overview.busy.map((b) => b.load)).toEqual([6 * 2]);
  });

  it('nothing recorded: every part is empty and nothing fails', () => {
    const overview = healthOverview(env.db, dog.id, NOW, 0);
    expect(overview).toMatchObject({ weight: null, weights: [], unusual: [], busy: [] });
    expect(overview.persistent).toBeNull();
    expect(overview.weeks.every((w) => w.walks === 0)).toBe(true);
  });
});
