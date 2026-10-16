import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createPlace, setWalkPlace } from './places';
import { START, testEnv, type TestEnv } from './test-utils';
import { walkUsual } from './usual';
import { createManualWalk } from './walks';

const DAY = 86_400_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const park = () =>
  createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 55, lon: 37 });
const yard = () =>
  createPlace(env.db, env.ctx, { category: 'yard', label: 'Двор', lat: 55.5, lon: 37 });

function walk(day: number, minutes: number, placeId: string | null, distanceM?: number): string {
  const id = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
    ...(distanceM === undefined ? {} : { distanceM }),
  }).id;
  if (placeId !== null) {
    setWalkPlace(env.db, env.ctx, id, { placeId, placeKind: null });
  }
  return id;
}

const settle = () => refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });

describe('walkUsual', () => {
  it('a long walk against the usual of walks in the same kind of place', () => {
    const p = park().id;
    [25, 28, 30, 32, 35, 29, 31].forEach((m, i) => walk(i, m, p));
    const target = walk(10, 45, p);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual).toMatchObject({ keys: ['place_kind'], widened: false, circleSize: 7 });
    expect(usual?.duration?.usual).toMatchObject({ n: 7, median: 30 * 60 });
    expect(usual?.duration?.comparison).toEqual({ kind: 'longer', diff: 15 * 60 });
    expect(usual?.duration?.value).toBe(45 * 60);
  });

  it('a walk like the others is the usual, and the walk itself is not in its own usual', () => {
    const p = park().id;
    const ids = [30, 30, 30, 30, 30, 31].map((m, i) => walk(i, m, p));
    settle();
    const usual = walkUsual(env.db, dog.id, ids[5] ?? '');
    expect(usual?.duration?.usual.n).toBe(5);
    expect(usual?.duration?.comparison.kind).toBe('usual');
  });

  it('too few in the same kind of place: it widens to any walk and says so', () => {
    const p = park().id;
    const y = yard().id;
    [30, 32, 28].forEach((m, i) => walk(i, m, p));
    [20, 22, 25, 18].forEach((m, i) => walk(5 + i, m, y));
    const target = walk(20, 31, p);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual).toMatchObject({ keys: [], widened: true, circleSize: 7 });
  });

  it('too few walks anywhere, a walk not worked out yet, an unknown walk: nothing is said', () => {
    const p = park().id;
    const early = walk(0, 30, p);
    [1, 2, 3].forEach((d) => walk(d, 30, p));
    settle();
    expect(walkUsual(env.db, dog.id, early)).toBeNull();
    const fresh = walk(9, 30, p);
    expect(walkUsual(env.db, dog.id, fresh)).toBeNull(); // not worked out yet
    expect(walkUsual(env.db, dog.id, 'nope')).toBeNull();
  });

  it('a walk shorter than two minutes is no walk: not compared and not compared with', () => {
    const p = park().id;
    [30, 30, 30, 30, 30].forEach((m, i) => walk(i, m, p));
    const slip = walk(7, 1, p);
    const target = walk(8, 30, p);
    settle();
    expect(walkUsual(env.db, dog.id, slip)).toBeNull();
    expect(walkUsual(env.db, dog.id, target)?.circleSize).toBe(5);
  });

  it('a measure the circle has too few values for is left out, not guessed', () => {
    const p = park().id;
    [30, 30, 30, 30, 30].forEach((m, i) => walk(i, m, p, i < 3 ? 2000 : undefined));
    const target = walk(9, 30, p, 2500);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual?.duration).not.toBeNull();
    expect(usual?.distance).toBeNull(); // only three of the five have a distance
    expect(usual?.pace).toBeNull(); // walks by hand have no moving time
  });

  it('distance is compared when enough walks have one', () => {
    const p = park().id;
    [1800, 2000, 2200, 2100, 1900].forEach((d, i) => walk(i, 30, p, d));
    const target = walk(9, 30, p, 3200);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual?.distance?.usual.median).toBe(2000);
    expect(usual?.distance?.comparison).toEqual({ kind: 'longer', diff: 1200 });
  });
});
