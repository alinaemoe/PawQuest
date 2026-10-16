import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { addPhoto } from './photos';
import {
  appendTrackPoints,
  computeWalkMetrics,
  finishWalk,
  listTrackPoints,
  startWalk,
  type TrackPointInput,
} from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { getWalk } from './walks';
import { splitWalk, trimWalkEnd } from './walkStructure';

const M_PER_DEG = 111_195;
const MIN = 60_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** 10 minutes of walking, then 20 minutes standing at a base; a finished walk. */
function forgottenWalk(): string {
  const points: TrackPointInput[] = [];
  let y = 0;
  let t = START;
  points.push({ ts: t, lat: 55, lon: 37, accuracyM: 5, speedMps: 0 });
  for (let s = 5; s <= 600; s += 5) {
    t += 5000;
    y += 1.3 * 5;
    points.push({ ts: t, lat: 55 + y / M_PER_DEG, lon: 37, accuracyM: 5, speedMps: 1.3 });
  }
  for (let s = 5; s <= 1200; s += 5) {
    t += 5000;
    points.push({
      ts: t,
      lat: 55 + y / M_PER_DEG + (s % 10 === 0 ? 0.000003 : 0),
      lon: 37,
      accuracyM: 5,
      speedMps: 0,
    });
  }
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  for (const [typeId, minutes] of [
    ['dog', 5],
    ['person', 20],
  ] as const) {
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: walk.id,
      typeId,
      ts: START + minutes * MIN,
      tzOffsetMin: 0,
      incomplete: false,
    });
  }
  finishWalk(env.db, env.ctx, walk.id, t);
  return walk.id;
}

const eventCount = (walkId: string): number =>
  Number(
    env.db.all('SELECT COUNT(*) AS n FROM event WHERE walk_id = ? AND deleted_at IS NULL', [
      walkId,
    ])[0]?.['n'],
  );

describe('trimWalkEnd (S-11)', () => {
  it('ends the walk at the cut and measures it again', () => {
    const id = forgottenWalk();
    expect(getWalk(env.db, id)?.durationS).toBe(1800);
    const trimmed = trimWalkEnd(env.db, env.ctx, id, START + 10 * MIN);
    expect(trimmed.endedAt).toBe(START + 10 * MIN);
    expect(trimmed.durationS).toBe(600);
    expect(trimmed.distanceM).toBeGreaterThan(740);
    expect(trimmed.distanceM).toBeLessThan(820);
  });

  it('keeps the cut fixes but out of the track, and events with the walk', () => {
    const id = forgottenWalk();
    const before = listTrackPoints(env.db, id).length;
    trimWalkEnd(env.db, env.ctx, id, START + 10 * MIN);
    const after = listTrackPoints(env.db, id);
    expect(after.length).toBeLessThan(before);
    expect(after[after.length - 1]?.ts).toBeLessThanOrEqual(START + 10 * MIN);
    const stored = Number(
      env.db.all('SELECT COUNT(*) AS n FROM track_point WHERE walk_id = ?', [id])[0]?.['n'],
    );
    expect(stored).toBe(before);
    expect(eventCount(id)).toBe(2);
  });

  it('later measurements ignore the cut part', () => {
    const id = forgottenWalk();
    trimWalkEnd(env.db, env.ctx, id, START + 10 * MIN);
    expect(computeWalkMetrics(env.db, id, START + 10 * MIN).distanceM).toBeLessThan(820);
  });

  it('refuses a cut outside the walk and a walk that is not finished', () => {
    const id = forgottenWalk();
    expect(() => trimWalkEnd(env.db, env.ctx, id, START)).toThrow(RangeError);
    expect(() => trimWalkEnd(env.db, env.ctx, id, START + 31 * MIN)).toThrow(RangeError);
    const running = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(() => trimWalkEnd(env.db, env.ctx, running.id, START + MIN)).toThrow();
    expect(() => trimWalkEnd(env.db, env.ctx, 'nope', START + MIN)).toThrow();
  });
});

describe('splitWalk (S-11)', () => {
  it('makes two walks that together cover the first one', () => {
    const id = forgottenWalk();
    const total = getWalk(env.db, id);
    const { first, second } = splitWalk(env.db, env.ctx, id, START + 10 * MIN);
    expect(first.id).toBe(id);
    expect(first.endedAt).toBe(START + 10 * MIN);
    expect(second.startedAt).toBe(START + 10 * MIN);
    expect(second.endedAt).toBe(total?.endedAt);
    expect((first.durationS ?? 0) + (second.durationS ?? 0)).toBe(total?.durationS);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
  });

  it('shares the track without losing a fix, and the distance without double counting', () => {
    const id = forgottenWalk();
    const total = listTrackPoints(env.db, id).length;
    const { first, second } = splitWalk(env.db, env.ctx, id, START + 10 * MIN);
    const a = listTrackPoints(env.db, first.id);
    const b = listTrackPoints(env.db, second.id);
    expect(a.length + b.length).toBe(total);
    expect(a[a.length - 1]?.ts ?? 0).toBeLessThan(START + 10 * MIN);
    expect(b[0]?.ts ?? 0).toBeGreaterThanOrEqual(START + 10 * MIN);
    expect(first.distanceM).toBeGreaterThan(740);
    expect(second.distanceM ?? 0).toBeLessThan(60);
  });

  it('moves the events and the pictures after the cut, with the dog', () => {
    const id = forgottenWalk();
    addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id },
      { uri: 'file:///a.jpg', takenAt: START + MIN },
    );
    addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id },
      { uri: 'file:///b.jpg', takenAt: START + 15 * MIN },
    );
    const { first, second } = splitWalk(env.db, env.ctx, id, START + 10 * MIN);
    expect(eventCount(first.id)).toBe(1);
    expect(eventCount(second.id)).toBe(1);
    const photos = (walkId: string): number =>
      Number(
        env.db.all(
          "SELECT COUNT(*) AS n FROM attachment WHERE owner_table = 'walk' AND owner_id = ?",
          [walkId],
        )[0]?.['n'],
      );
    expect(photos(first.id)).toBe(1);
    expect(photos(second.id)).toBe(1);
    const dogs = env.db.all('SELECT dog_id FROM walk_dog WHERE walk_id = ?', [second.id]);
    expect(dogs.map((d) => d['dog_id'])).toEqual([dog.id]);
  });

  it('the segment that crosses the cut belongs to both, closed on both sides', () => {
    const id = forgottenWalk();
    const segments = (walkId: string) =>
      env.db.all('SELECT kind, started_at, ended_at FROM walk_segment WHERE walk_id = ?', [walkId]);
    const { first, second } = splitWalk(env.db, env.ctx, id, START + 10 * MIN);
    expect(segments(first.id).length).toBeGreaterThan(0);
    expect(segments(second.id).length).toBeGreaterThan(0);
    for (const s of [...segments(first.id), ...segments(second.id)]) {
      expect(s['ended_at']).not.toBeNull();
    }
  });

  it('refuses a cut at the edges and a missing walk', () => {
    const id = forgottenWalk();
    expect(() => splitWalk(env.db, env.ctx, id, START)).toThrow(RangeError);
    expect(() => splitWalk(env.db, env.ctx, id, START + 30 * MIN)).toThrow(RangeError);
    expect(() => splitWalk(env.db, env.ctx, 'nope', START + MIN)).toThrow();
  });
});
