import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { walkBaseArrival, walkChronology } from './chronology';
import { createDog, type Dog } from './dogs';
import { createPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';

const SHOP = { lat: 55.7558, lon: 37.6173 };
const STEP = 0.00001; // about 1.1 m north per second

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** Walks 150 s, stands at `stopAt` for `stopS`, walks 150 s more; returns the walk id. */
function recordWalk(stopAt: { lat: number; lon: number }, stopS: number): string {
  const points: TrackPointInput[] = [];
  let t = START;
  for (let i = 0; i < 150; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat - (150 - i) * STEP,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 1.2,
    });
  }
  for (let i = 0; i < stopS; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat + (i % 2) * 0.000004,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 0,
    });
  }
  for (let i = 1; i <= 150; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat + i * STEP,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 1.2,
    });
  }
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, t);
  return walk.id;
}

describe('walkChronology', () => {
  it('recognises a saved place in the visit and names the walk after it', () => {
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    const id = recordWalk(SHOP, 420);
    const result = walkChronology(env.db, id, START + 3_600_000);
    expect(result?.steps.map((s) => s.kind)).toEqual(['leg', 'visit', 'leg']);
    expect(result?.title).toBe('Магазин');
    const visit = result?.steps.find((s) => s.kind === 'visit');
    expect(visit?.kind === 'visit' ? visit.placeId : null).not.toBeNull();
  });

  it('the same walk without that place has an unnamed visit and no title', () => {
    const id = recordWalk(SHOP, 420);
    const result = walkChronology(env.db, id, START + 3_600_000);
    expect(result?.title).toBeNull();
    expect(result?.steps.filter((s) => s.kind === 'visit')).toHaveLength(1);
  });

  it('a place named later changes the result for the old walk', () => {
    const id = recordWalk(SHOP, 420);
    expect(walkChronology(env.db, id, START + 3_600_000)?.title).toBeNull();
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    expect(walkChronology(env.db, id, START + 3_600_000)?.title).toBe('Магазин');
  });

  it('a walk without a track, a missing walk and a one-point track have no chronology', () => {
    const manual = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    expect(walkChronology(env.db, manual.id, START)).toBeNull();
    expect(walkChronology(env.db, 'nope', START)).toBeNull();
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, [{ ts: START, ...SHOP, accuracyM: 5, speedMps: 0 }]);
    expect(walkChronology(env.db, walk.id, START)).toBeNull();
  });
});

describe('walkBaseArrival', () => {
  /** A running walk: 150 s of walking, then `stopS` seconds standing at the spot. */
  function runningWalk(stopS: number): string {
    const points: TrackPointInput[] = [];
    let t = START;
    for (let i = 0; i < 150; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat - (150 - i) * STEP,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 1.2,
      });
    }
    for (let i = 0; i < stopS; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat + (i % 2) * 0.000004,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 0,
      });
    }
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    return walk.id;
  }

  it('asks at a guests place after fifteen minutes, with its name and arrival time', () => {
    createPlace(env.db, env.ctx, { name: 'Мама', category: 'guests', label: 'Гости', ...SHOP });
    const id = runningWalk(1200);
    const found = walkBaseArrival(env.db, id, START + 150_000 + 1_200_000);
    expect(found?.placeName).toBe('Мама');
    expect(found?.stayS).toBeGreaterThan(1100);
    expect(found?.arrivedAt).toBeGreaterThanOrEqual(START + 100_000);
    expect(found?.arrivedAt).toBeLessThanOrEqual(START + 200_000);
  });

  it('does not ask at a shop, or when the place has no name yet, or before fifteen minutes', () => {
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    expect(walkBaseArrival(env.db, runningWalk(1200), START + 2_000_000)).toBeNull();
  });

  it('a walk without points has nothing to ask', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(walkBaseArrival(env.db, walk.id, START)).toBeNull();
  });
});
