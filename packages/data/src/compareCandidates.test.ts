import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compareCandidates } from './compareCandidates';
import { refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';

const DAY = 86_400_000;
const M = 111_195;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A walk of a few minutes along a line that starts `x` meters east of the origin. */
function walkAt(day: number, x: number, withTrack = true): string {
  const w = startWalk(env.db, env.ctx, { dogId: dog.id });
  env.db.run('UPDATE walk SET started_at = ? WHERE id = ?', [
    new Date(START + day * DAY).toISOString(),
    w.id,
  ]);
  if (withTrack) {
    const lon = (m: number) => 37 + m / (M * Math.cos((55 * Math.PI) / 180));
    appendTrackPoints(
      env.db,
      w.id,
      Array.from({ length: 40 }, (_, i) => ({
        ts: START + day * DAY + i * 5000,
        lat: 55,
        lon: lon(x + i * 6),
        accuracyM: 5,
        speedMps: 1.3,
      })),
    );
  }
  finishWalk(env.db, env.ctx, w.id, START + day * DAY + 200_000);
  return w.id;
}

describe('compareCandidates', () => {
  it('walks in the same place first, newest first within a group; walks with no track and the walk itself are left out', () => {
    const park = createPlace(env.db, env.ctx, {
      name: 'Парк',
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37 + 100 / (M * Math.cos((55 * Math.PI) / 180)),
      radiusM: 300,
    });
    const target = walkAt(5, 0);
    const parkOld = walkAt(1, 20);
    const parkNew = walkAt(3, 40);
    const elsewhere = walkAt(4, 5000);
    walkAt(2, 0, false);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const list = compareCandidates(env.db, dog.id, target);
    expect(list.map((c) => c.walkId)).toEqual([parkNew, parkOld, elsewhere]);
    expect(list.map((c) => c.samePlace)).toEqual([true, true, false]);
    expect(list[0]?.placeName).toBe(park.name);
    expect(list[2]?.placeName).toBeNull();
  });
});
