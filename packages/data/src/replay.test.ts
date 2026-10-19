import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { toIso } from './ids';
import { addWalkPhoto } from './photos';
import { createPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { walkReplay } from './replay';
import { createRoute } from './routes';
import { START, testEnv, type TestEnv } from './test-utils';

const M_PER_DEG = 111_195;
const LAT0 = 55;
const LON0 = 37;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const spot = (x: number, y: number) => ({
  lat: LAT0 + y / M_PER_DEG,
  lon: LON0 + x / (M_PER_DEG * COS),
});

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A straight walk east at 1.3 m/s, a fix every 5 s, `minutes` long. */
function straightWalk(minutes: number): { id: string; points: TrackPointInput[]; endTs: number } {
  const points: TrackPointInput[] = [];
  const steps = (minutes * 60) / 5;
  for (let i = 0; i <= steps; i += 1) {
    points.push({
      ts: START + i * 5000,
      ...spot(i * 6.5, 0),
      accuracyM: 5,
      speedMps: i === 0 ? 0 : 1.3,
    });
  }
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  const endTs = START + steps * 5000;
  finishWalk(env.db, env.ctx, walk.id, endTs);
  return { id: walk.id, points, endTs };
}

describe('walkReplay', () => {
  it('a walk becomes points with distance, a thin line, events, photos, a route pass and a profile', () => {
    createPlace(env.db, env.ctx, {
      name: 'Поле',
      category: 'park',
      label: 'Поле',
      ...spot(1000, 0),
      radiusM: 300,
    });
    const { id, points, endTs } = straightWalk(30);
    createRoute(env.db, env.ctx, {
      name: 'Прямая',
      points: points.map(({ lat, lon }) => ({ lat, lon })),
    });
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: id,
      typeId: 'dog',
      reaction: 3,
      ts: START + 300_000,
      tzOffsetMin: 0,
    });
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: id,
      typeId: 'hard',
      ts: START + 900_000,
      tzOffsetMin: 0,
    });
    addWalkPhoto(env.db, env.ctx, id, { uri: 'file:///a.jpg', takenAt: START + 600_000 });
    const replay = walkReplay(env.db, id, endTs + 1000);
    expect(replay).not.toBeNull();
    expect(replay?.points).toHaveLength(points.length);
    expect(replay?.cumulativeM[0]).toBe(0);
    expect(replay?.cumulativeM[replay.cumulativeM.length - 1]).toBeCloseTo(1800 * 1.3, -1);
    expect(replay?.line.length).toBeLessThan(10);
    expect(replay?.events.map((e) => e.typeId)).toEqual(['dog', 'hard']);
    expect(replay?.photos.map((p) => p.uri)).toEqual(['file:///a.jpg']);
    expect(replay?.passes).toMatchObject([{ routeName: 'Прямая', direction: 'forward' }]);
    expect(replay?.zones).toMatchObject([{ name: 'Поле', category: 'park' }]);
    expect(replay?.profile?.zoneS.walk).toBeGreaterThan(1700);
    expect(replay).toMatchObject({ startTs: START, endTs });
  });

  it('manual pauses are listed and left out of the speed profile', () => {
    const { id, endTs } = straightWalk(30);
    env.db.run(
      "INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, 'paused', ?, ?)",
      ['seg-p', id, toIso(START + 600_000), toIso(START + 720_000)],
    );
    env.db.run(
      "INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, 'paused', ?, NULL)",
      ['seg-q', id, toIso(endTs - 60_000)],
    );
    const replay = walkReplay(env.db, id, endTs + 1000);
    expect(replay?.paused).toEqual([
      { fromTs: START + 600_000, toTs: START + 720_000 },
      { fromTs: endTs - 60_000, toTs: endTs },
    ]);
    expect(replay?.profile?.knownS).toBeLessThan(1800 - 120);
  });

  it('a walk still going and fixes without a device speed can be played', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    const points = Array.from({ length: 30 }, (_, i) => ({
      ts: START + i * 5000,
      ...spot(i * 6.5, 0),
      accuracyM: 5,
    }));
    appendTrackPoints(env.db, walk.id, points);
    const replay = walkReplay(env.db, walk.id, START + 200_000);
    expect(replay?.points[1]).not.toHaveProperty('speedMps');
    expect(replay?.endTs).toBe(START + 29 * 5000);
    expect(replay?.profile?.knownS).toBeGreaterThan(100);
  });

  it('a walk that is not there, or has no track, has nothing to play', () => {
    expect(walkReplay(env.db, 'nope', START)).toBeNull();
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    finishWalk(env.db, env.ctx, walk.id, START + 60_000);
    expect(walkReplay(env.db, walk.id, START + 60_000)).toBeNull();
  });
});
