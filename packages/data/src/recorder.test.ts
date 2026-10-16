import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import {
  appendTrackPoints,
  computeWalkMetrics,
  discardWalk,
  finishWalk,
  getActiveWalk,
  getRunningWalkId,
  lastTrackPoint,
  listTrackPoints,
  pauseWalk,
  recoverWalk,
  resumeWalk,
  startWalk,
  type TrackPointInput,
} from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const M_PER_DEG = 111_195;
/** A fix every second heading north at 1.4 m/s from second `from` to `to` (exclusive). */
function walkNorth(from: number, to: number): TrackPointInput[] {
  const points: TrackPointInput[] = [];
  for (let s = from; s < to; s += 1) {
    points.push({
      ts: START + s * 1000,
      lat: 55 + (1.4 * s) / M_PER_DEG,
      lon: 37,
      accuracyM: 5,
      speedMps: 1.4,
    });
  }
  return points;
}

const segments = (walkId: string) =>
  env.db
    .all('SELECT kind, ended_at FROM walk_segment WHERE walk_id = ? ORDER BY started_at, rowid', [
      walkId,
    ])
    .map((r) => [r['kind'], r['ended_at'] === null ? 'open' : 'closed']);

describe('startWalk', () => {
  it('creates an active walk linked to the dog with an open moving segment', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id, tzOffsetMin: 180, placeKind: 'park' });
    expect(walk).toMatchObject({
      status: 'active',
      mode: 'gps',
      startedAt: START,
      placeKind: 'park',
    });
    expect(segments(walk.id)).toEqual([['moving', 'open']]);
    expect(env.db.all('SELECT dog_id FROM walk_dog WHERE walk_id = ?', [walk.id])).toEqual([
      { dog_id: dog.id },
    ]);
    expect(getActiveWalk(env.db, dog.id)?.id).toBe(walk.id);
  });

  it('only one walk at a time; another dog is independent', () => {
    startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(() => startWalk(env.db, env.ctx, { dogId: dog.id })).toThrow(/already/);
    const other = createDog(env.db, env.ctx, { name: 'Бим' });
    expect(startWalk(env.db, env.ctx, { dogId: other.id, mode: 'no_gps' }).mode).toBe('no_gps');
    expect(getActiveWalk(env.db, other.id)).not.toBeNull();
  });
});

describe('getRunningWalkId', () => {
  it('is the active walk, not a paused, finished or missing one', () => {
    expect(getRunningWalkId(env.db)).toBeNull();
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(getRunningWalkId(env.db)).toBe(walk.id);
    pauseWalk(env.db, env.ctx, walk.id);
    expect(getRunningWalkId(env.db)).toBeNull();
    resumeWalk(env.db, env.ctx, walk.id);
    finishWalk(env.db, env.ctx, walk.id);
    expect(getRunningWalkId(env.db)).toBeNull();
  });
});

describe('pause and resume', () => {
  it('moves between active and paused and keeps the segments in order', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    env.advance(60_000);
    expect(pauseWalk(env.db, env.ctx, walk.id)).toBe(true);
    expect(getActiveWalk(env.db, dog.id)?.status).toBe('paused');
    env.advance(30_000);
    expect(resumeWalk(env.db, env.ctx, walk.id)).toBe(true);
    expect(getActiveWalk(env.db, dog.id)?.status).toBe('active');
    expect(segments(walk.id)).toEqual([
      ['moving', 'closed'],
      ['paused', 'closed'],
      ['moving', 'open'],
    ]);
  });

  it('invalid transitions do nothing', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(resumeWalk(env.db, env.ctx, walk.id)).toBe(false);
    pauseWalk(env.db, env.ctx, walk.id);
    expect(pauseWalk(env.db, env.ctx, walk.id)).toBe(false);
    expect(pauseWalk(env.db, env.ctx, 'missing')).toBe(false);
    expect(segments(walk.id)).toHaveLength(2);
  });
});

describe('track points', () => {
  it('stores batches and reads them back in time order, with the last one', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, walkNorth(5, 10));
    appendTrackPoints(env.db, walk.id, walkNorth(0, 5));
    appendTrackPoints(env.db, walk.id, []);
    const points = listTrackPoints(env.db, walk.id);
    expect(points.map((p) => (p.ts - START) / 1000)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(points[0]).toMatchObject({ accuracyM: 5, speedMps: 1.4 });
    expect(lastTrackPoint(env.db, walk.id)?.ts).toBe(START + 9000);
    expect(lastTrackPoint(env.db, 'none')).toBeNull();
  });

  it('a point without accuracy or speed reads back without them; excluded ones are skipped', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, [
      { ts: START, lat: 55, lon: 37 },
      { ts: START + 1000, lat: 55.0001, lon: 37, accuracyM: 4 },
    ]);
    env.db.run('UPDATE track_point SET excluded = 1 WHERE ts = ?', [
      new Date(START + 1000).toISOString(),
    ]);
    const points = listTrackPoints(env.db, walk.id);
    expect(points).toHaveLength(1);
    expect(points[0]).not.toHaveProperty('accuracyM');
  });

  it('a failed batch writes nothing (transaction)', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(() => {
      appendTrackPoints(env.db, walk.id, [
        { ts: START, lat: 55, lon: 37 },
        { ts: START + 1000, lat: Number.NaN, lon: 37 },
      ]);
    }).toThrow();
    expect(listTrackPoints(env.db, walk.id)).toEqual([]);
  });
});

describe('finishWalk', () => {
  it('fixes duration, moving time, pause and distance from the stored track', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, walkNorth(0, 100));
    env.advance(100_000);
    pauseWalk(env.db, env.ctx, walk.id);
    env.advance(60_000); // paused 100..160 s, no fixes
    resumeWalk(env.db, env.ctx, walk.id);
    appendTrackPoints(env.db, walk.id, walkNorth(160, 260));
    env.advance(100_000);

    const done = finishWalk(env.db, env.ctx, walk.id);
    expect(done.status).toBe('completed');
    expect(done.durationS).toBe(260);
    expect(done.endedAt).toBe(START + 260_000);
    const row = env.db.all('SELECT moving_s, paused_s, distance_m, summary_pending FROM walk')[0];
    expect(row?.['paused_s']).toBe(60);
    expect(row?.['summary_pending']).toBe(1);
    // 1.4 m/s for 198 s of fixes: about 277 m, within the filter's tolerance
    expect(Number(row?.['distance_m'])).toBeGreaterThan(250);
    expect(Number(row?.['distance_m'])).toBeLessThan(300);
    expect(Number(row?.['moving_s'])).toBeGreaterThan(185);
    expect(Number(row?.['moving_s'])).toBeLessThanOrEqual(200);
    expect(segments(walk.id).every(([, state]) => state === 'closed')).toBe(true);
    expect(getActiveWalk(env.db, dog.id)).toBeNull();
  });

  it('a walk without fixes finishes with zero distance (no GPS mode)', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id, mode: 'no_gps' });
    env.advance(600_000);
    const done = finishWalk(env.db, env.ctx, walk.id);
    expect(done).toMatchObject({ status: 'completed', durationS: 600, distanceM: 0 });
  });

  it('refuses to finish a walk that is not running', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    finishWalk(env.db, env.ctx, walk.id);
    expect(() => finishWalk(env.db, env.ctx, walk.id)).toThrow(/running/);
    expect(() => finishWalk(env.db, env.ctx, 'missing')).toThrow(/running/);
  });

  it('can finish a paused walk and counts the open pause up to the end', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    env.advance(120_000);
    pauseWalk(env.db, env.ctx, walk.id);
    env.advance(30_000);
    const done = finishWalk(env.db, env.ctx, walk.id);
    expect(done.durationS).toBe(150);
    expect(env.db.all('SELECT paused_s FROM walk')[0]).toEqual({ paused_s: 30 });
  });

  it('computeWalkMetrics treats an open pause as lasting until now', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    env.advance(10_000);
    pauseWalk(env.db, env.ctx, walk.id);
    expect(computeWalkMetrics(env.db, walk.id, START + 40_000).pausedS).toBe(30);
  });
});

describe('discardWalk', () => {
  it('marks a running walk discarded and refuses otherwise', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(discardWalk(env.db, env.ctx, walk.id)).toBe(true);
    expect(getActiveWalk(env.db, dog.id)).toBeNull();
    expect(env.db.all('SELECT status FROM walk')[0]).toEqual({ status: 'discarded' });
    expect(discardWalk(env.db, env.ctx, walk.id)).toBe(false);
  });
});

describe('recoverWalk (after the app was killed)', () => {
  const crashedWalk = () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, walkNorth(0, 100));
    env.advance(100_000);
    env.advance(15 * 60_000); // the app was dead for 15 minutes
    return walk;
  };

  it('continue: marks the missing time as a gap and keeps recording', () => {
    const walk = crashedWalk();
    const recovered = recoverWalk(env.db, env.ctx, walk.id, 'continue');
    expect(recovered?.status).toBe('active');
    expect(segments(walk.id)).toEqual([
      ['moving', 'closed'],
      ['gap', 'closed'],
      ['moving', 'open'],
    ]);
  });

  it('continue after a short silence adds no gap', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, walkNorth(0, 10));
    env.advance(20_000);
    recoverWalk(env.db, env.ctx, walk.id, 'continue');
    expect(segments(walk.id).map(([kind]) => kind)).toEqual(['moving', 'moving']);
  });

  it('finish: ends the walk at the last recorded point', () => {
    const walk = crashedWalk();
    const done = recoverWalk(env.db, env.ctx, walk.id, 'finish');
    expect(done).toMatchObject({ status: 'completed', endedAt: START + 99_000, durationS: 99 });
  });

  it('discard drops it; a walk that is not running cannot be recovered', () => {
    const walk = crashedWalk();
    expect(recoverWalk(env.db, env.ctx, walk.id, 'discard')).toBeNull();
    expect(env.db.all('SELECT status FROM walk')[0]).toEqual({ status: 'discarded' });
    expect(recoverWalk(env.db, env.ctx, walk.id, 'continue')).toBeNull();
    expect(recoverWalk(env.db, env.ctx, 'missing', 'finish')).toBeNull();
  });

  it('finishing without any fix ends at the start', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    env.advance(500_000);
    expect(recoverWalk(env.db, env.ctx, walk.id, 'finish')?.durationS).toBe(0);
  });
});
