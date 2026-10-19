import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { appendTrackPoints, finishWalk, startWalk } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { walkLines } from './walkLines';
import { createManualWalk } from './walks';

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A walk along a line with `count` points a few metres apart and a little wobble. */
function track(count: number): { id: string; startedAt: number } {
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(
    env.db,
    walk.id,
    Array.from({ length: count }, (_, i) => ({
      ts: START + i * 2000,
      lat: 55 + i * 2e-5,
      lon: 37 + (i % 2) * 2e-6,
      accuracyM: 4,
    })),
  );
  finishWalk(env.db, env.ctx, walk.id, START + count * 2000);
  return { id: walk.id, startedAt: START };
}

describe('walkLines', () => {
  it('a long straight walk becomes a handful of vertices, ends kept', () => {
    const walk = track(3000);
    const [line] = walkLines(env.db, [walk]);
    expect(line?.walkId).toBe(walk.id);
    expect(line?.coordinates.length).toBeLessThan(20);
    expect(line?.coordinates[0]?.[1]).toBeCloseTo(55, 5);
    expect(line?.coordinates[line.coordinates.length - 1]?.[1]).toBeCloseTo(55 + 2999 * 2e-5, 5);
  });

  it('never more than 1500 vertices, however winding', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(
      env.db,
      walk.id,
      Array.from({ length: 6000 }, (_, i) => ({
        ts: START + i * 1000,
        lat: 55 + Math.sin(i / 3) * 0.002 + i * 1e-6,
        lon: 37 + Math.cos(i / 2) * 0.002,
        accuracyM: 4,
      })),
    );
    finishWalk(env.db, env.ctx, walk.id, START + 6_000_000);
    const [line] = walkLines(env.db, [{ id: walk.id, startedAt: START }], 0.1);
    expect(line?.coordinates.length).toBeLessThanOrEqual(1500);
  });

  it('a walk with no track is left out; the order of the walks is kept', () => {
    const a = track(50);
    const manual = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    const lines = walkLines(env.db, [{ id: manual.id, startedAt: START }, a]);
    expect(lines.map((l) => l.walkId)).toEqual([a.id]);
  });
});
