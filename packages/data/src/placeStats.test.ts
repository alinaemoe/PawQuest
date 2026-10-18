import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { createPlace, setWalkPlace } from './places';
import { placeActivity } from './placeStats';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';

const DAY = 86_400_000;
const NOW = START + 20 * DAY;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

function walkAt(placeId: string | null, day: number, minutes: number): string {
  const id = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
  }).id;
  if (placeId !== null) {
    setWalkPlace(env.db, env.ctx, id, { placeId, placeKind: null });
  }
  return id;
}

describe('placeActivity', () => {
  it('places by number of walks, each with a summary and twelve weeks', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    const yard = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: 55.5,
      lon: 37,
    });
    createPlace(env.db, env.ctx, { category: 'forest', label: 'Лес', lat: 56, lon: 37 }); // never walked
    [30, 40, 50, 60, 20].forEach((m, i) => walkAt(park.id, 12 + i, m));
    walkAt(yard.id, 17, 15);
    walkAt(null, 18, 30); // no place
    walkAt(park.id, 19, 1); // under two minutes: no walk
    const id = walkAt(park.id, 16, 45);
    createEvent(env.db, env.ctx, { dogId: dog.id, walkId: id, typeId: 'dog', tzOffsetMin: 0 });
    const stats = placeActivity(env.db, dog.id, NOW, 0);
    expect(stats.map((s) => [s.category, s.summary.walks])).toEqual([
      ['park', 6],
      ['yard', 1],
    ]);
    expect(stats[0]?.summary).toMatchObject({ enough: true, events: 1, medianS: 42.5 * 60 });
    expect(stats[0]?.weeks).toHaveLength(12);
    expect(stats[0]?.weeks.reduce((sum, w) => sum + w.walks, 0)).toBe(6);
    expect(stats[1]?.summary.enough).toBe(false);
  });

  it('ties go to the place walked more lately; nothing walked gives nothing', () => {
    expect(placeActivity(env.db, dog.id, NOW, 0)).toEqual([]);
    const a = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 55, lon: 37 });
    const b = createPlace(env.db, env.ctx, { category: 'yard', label: 'Двор', lat: 55.5, lon: 37 });
    walkAt(a.id, 10, 30);
    walkAt(b.id, 15, 30);
    expect(placeActivity(env.db, dog.id, NOW, 0).map((s) => s.category)).toEqual(['yard', 'park']);
  });
});
