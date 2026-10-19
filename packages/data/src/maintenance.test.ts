import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { METRICS_VERSION, refreshMovingTimes } from './maintenance';
import { appendTrackPoints, finishWalk, startWalk } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { getWalk } from './walks';

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A walk with a fix every 40 s while walking (the phone gave few): 1.2 m/s for 40 minutes. */
function sparseWalk(day: number): string {
  const t0 = START + day * 86_400_000;
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(
    env.db,
    walk.id,
    Array.from({ length: 61 }, (_, i) => ({
      ts: t0 + i * 40_000,
      lat: 55 + (i * 48) / 111_195,
      lon: 37,
      accuracyM: 5,
    })),
  );
  finishWalk(env.db, env.ctx, walk.id, t0 + 2_400_000);
  return walk.id;
}

describe('refreshMovingTimes', () => {
  it('walks measured by an older rule get the time in motion again, once', () => {
    const a = sparseWalk(0);
    env.db.run('UPDATE walk SET moving_s = 60 WHERE id = ?', [a]);
    const b = sparseWalk(1);
    env.db.run('UPDATE walk SET moving_s = 60 WHERE id = ?', [b]);
    expect(refreshMovingTimes(env.db, env.ctx, 1)).toBe(1); // one walk, more to come
    const redone = [a, b].filter((id) => (getWalk(env.db, id)?.movingS ?? 0) > 2000);
    expect(redone).toHaveLength(1);
    expect(refreshMovingTimes(env.db, env.ctx, 1)).toBe(1);
    expect(refreshMovingTimes(env.db, env.ctx, 1)).toBe(0); // nothing left: the version is written
    expect(getWalk(env.db, b)?.movingS).toBeGreaterThan(2000);
    env.db.run('UPDATE walk SET moving_s = 5 WHERE id = ?', [a]);
    expect(refreshMovingTimes(env.db, env.ctx)).toBe(0); // current: walks are left alone
    expect(getWalk(env.db, a)?.movingS).toBe(5);
    expect(METRICS_VERSION).toBeGreaterThan(1);
  });

  it('no walks at all is current at once', () => {
    expect(refreshMovingTimes(env.db, env.ctx)).toBe(0);
  });
});
