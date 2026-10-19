import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { liveZones } from './liveZones';
import { createPlace } from './places';
import { appendTrackPoints, startWalk, type TrackPointInput } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';

const M_PER_DEG = 111_195;
const COS = Math.cos((55 * Math.PI) / 180);
const spot = (x: number) => ({ lat: 55, lon: 37 + x / (M_PER_DEG * COS) });

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A running walk: fixes every 2 s along x, each pair is (second, x). */
function running(pairs: readonly (readonly [number, number])[]): string {
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  const points: TrackPointInput[] = pairs.map(([s, x]) => ({
    ts: START + s * 1000,
    ...spot(x),
    accuracyM: 5,
  }));
  appendTrackPoints(env.db, walk.id, points);
  return walk.id;
}

const line = (from: number, to: number, seconds: number, x0: number, x1: number) =>
  Array.from({ length: Math.round(seconds / 2) + 1 }, (_, i) => {
    const t = i / Math.round(seconds / 2);
    return [from + (to - from) * t, x0 + (x1 - x0) * t] as const;
  });

describe('liveZones', () => {
  it('the places the walk is inside now, the widest first, with the notes of the place', () => {
    createPlace(env.db, env.ctx, {
      name: 'Парк',
      category: 'park',
      label: 'Парк',
      ...spot(500),
      radiusM: 200,
      notes: 'Здесь лисы, поводок',
    });
    createPlace(env.db, env.ctx, {
      name: 'Поляна',
      category: 'meadow',
      label: 'Поляна',
      ...spot(500),
      radiusM: 40,
    });
    const id = running(line(0, 300, 300, 200, 500));
    const now = START + 300_000;
    const zones = liveZones(env.db, id, now);
    expect(zones.map((z) => z.name)).toEqual(['Парк', 'Поляна']);
    expect(zones[0]?.notes).toBe('Здесь лисы, поводок');
    expect(zones[1]?.notes).toBeNull();
    expect(zones[0]?.sinceTs).toBeLessThan(START + 300_000);
  });

  it('after leaving the place, and before entering it, the walk is in none', () => {
    createPlace(env.db, env.ctx, {
      name: 'Парк',
      category: 'park',
      label: 'Парк',
      ...spot(500),
      radiusM: 100,
    });
    const before = running(line(0, 100, 100, 0, 150));
    expect(liveZones(env.db, before, START + 100_000)).toEqual([]);
    env.db.run("UPDATE walk SET status = 'completed' WHERE id = ?", [before]);
    const left = running(line(0, 400, 400, 450, 900));
    expect(liveZones(env.db, left, START + 400_000)).toEqual([]);
  });

  it('a walk with no track yet, or no places: nothing', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(liveZones(env.db, walk.id, START)).toEqual([]);
    env.db.run("UPDATE walk SET status = 'completed' WHERE id = ?", [walk.id]);
    const id = running(line(0, 100, 100, 0, 100));
    expect(liveZones(env.db, id, START + 100_000)).toEqual([]);
  });
});
