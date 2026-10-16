import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { walkChronology } from './chronology';
import { createDog, type Dog } from './dogs';
import {
  appendTrackPoints,
  computeWalkMetrics,
  finishWalk,
  startWalk,
  walkRideSeconds,
  type TrackPointInput,
} from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { getWalk } from './walks';

const M_PER_DEG = 111_195;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** North along a line: each piece is [seconds, m/s]; a fix every 5 s. */
function drive(pieces: readonly (readonly [number, number])[]): {
  points: TrackPointInput[];
  end: number;
} {
  const points: TrackPointInput[] = [];
  let y = 0;
  let t = START;
  points.push({ ts: t, lat: 55 + y / M_PER_DEG, lon: 37, accuracyM: 5, speedMps: 0 });
  for (const [seconds, speed] of pieces) {
    for (let s = 5; s <= seconds; s += 5) {
      t += 5000;
      y += speed * 5;
      points.push({ ts: t, lat: 55 + y / M_PER_DEG, lon: 37, accuracyM: 5, speedMps: speed });
    }
  }
  return { points, end: t };
}

function record(pieces: readonly (readonly [number, number])[]) {
  const { points, end } = drive(pieces);
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  return { id: walk.id, end };
}

describe('a ride inside a walk (S-9)', () => {
  const pieces = [
    [600, 1.3],
    [1500, 10],
    [300, 1.3],
  ] as const;

  it('leaves the distance, the duration and the moving time of the walk', () => {
    const { id, end } = record(pieces);
    const metrics = computeWalkMetrics(env.db, id, end);
    expect(metrics.rideS).toBeGreaterThan(1480);
    expect(metrics.rideS).toBeLessThan(1520);
    // walked: 900 s at 1.3 m/s
    expect(metrics.distanceM).toBeGreaterThan(1050);
    expect(metrics.distanceM).toBeLessThan(1300);
    expect(metrics.movingS).toBeLessThan(950);
    const done = finishWalk(env.db, env.ctx, id, end);
    expect(done.durationS).toBe(Math.round(2400 - walkRideSeconds(env.db, id)));
    expect(done.durationS).toBeGreaterThan(880);
    expect(done.durationS).toBeLessThan(920);
    expect(walkRideSeconds(env.db, id)).toBe(Math.round(metrics.rideS));
    expect(getWalk(env.db, id)?.distanceM).toBeLessThan(1300);
  });

  it('a walk without a ride has none stored', () => {
    const { id, end } = record([[1200, 1.3]]);
    const done = finishWalk(env.db, env.ctx, id, end);
    expect(walkRideSeconds(env.db, id)).toBe(0);
    expect(done.durationS).toBe(1200);
  });

  it('is a step of its own in the chronology', () => {
    const { id, end } = record(pieces);
    finishWalk(env.db, env.ctx, id, end);
    const kinds = walkChronology(env.db, id, end)?.steps.map((s) => s.kind);
    expect(kinds).toEqual(['leg', 'ride', 'leg']);
  });
});
