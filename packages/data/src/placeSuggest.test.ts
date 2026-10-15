import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createPlace, getPlace } from './places';
import { linkWalksToPlace, proposalKey, proposePlaces, walkAnchor } from './placeSuggest';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';

const SPOT = { lat: 55.7558, lon: 37.6173 };
const STEP = 0.00001; // about 1.1 m north per second: a steady walking pace

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Луна' });
});
afterEach(() => {
  env.db.close();
});

/**
 * A GPS walk that walks 60 s, stands still at `stopAt` for `stopS`, and walks 60 s more.
 * `dayOffset` keeps the timestamps of different walks apart.
 */
function recordWalk(stopAt: { lat: number; lon: number }, stopS: number, dayOffset: number) {
  const t0 = START + dayOffset * 86_400_000;
  const points: TrackPointInput[] = [];
  let t = t0;
  for (let i = 0; i < 60; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat - (60 - i) * STEP,
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
  for (let i = 1; i <= 60; i++, t += 1000) {
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

describe('proposePlaces', () => {
  it('proposes a spot where long stops repeat across walks', () => {
    const a = recordWalk(SPOT, 240, 0);
    const b = recordWalk({ lat: SPOT.lat + 0.00002, lon: SPOT.lon }, 300, 1);
    const c = recordWalk({ lat: SPOT.lat, lon: SPOT.lon + 0.00003 }, 200, 2);
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ walkCount: 3, stopCount: 3 });
    expect(found[0]?.lat).toBeCloseTo(SPOT.lat, 4);
    expect([...(found[0]?.walkIds ?? [])].sort()).toEqual([a, b, c].sort());
    expect(found[0]?.key).toBe(proposalKey(found[0] ?? SPOT));
  });

  it('needs three stops, from at least two walks, each long enough', () => {
    recordWalk(SPOT, 240, 0);
    recordWalk(SPOT, 240, 1);
    expect(proposePlaces(env.db, START + 2 * 86_400_000)).toEqual([]); // only two stops
    recordWalk(SPOT, 100, 2); // a short stop does not count
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toEqual([]);
    recordWalk(SPOT, 200, 3);
    expect(proposePlaces(env.db, START + 4 * 86_400_000)).toHaveLength(1);
  });

  it('skips a spot that already has a saved place close by', () => {
    for (const day of [0, 1, 2]) {
      recordWalk(SPOT, 240, day);
    }
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toHaveLength(1);
    createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...SPOT });
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toEqual([]);
  });

  it('ignores old walks, discarded walks and walks without a GPS track', () => {
    for (const day of [0, 1, 2]) {
      recordWalk(SPOT, 240, day);
    }
    expect(proposePlaces(env.db, START + 400 * 86_400_000)).toEqual([]); // older than 120 days
    expect(proposePlaces(env.db, START + 400 * 86_400_000, { sinceDays: 1000 })).toHaveLength(1);
    expect(proposePlaces(env.db, START + 3 * 86_400_000, { maxWalks: 2 })).toEqual([]);
    env.db.run("UPDATE walk SET status = 'discarded'");
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toEqual([]);
  });

  it('a manual pause is not a stop', () => {
    // the 240 s of standing are covered by a pause the owner pressed
    for (const day of [0, 1, 2]) {
      const id = recordWalk(SPOT, 240, day);
      const from = START + day * 86_400_000 + 55_000;
      env.db.run(
        "INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES (?, ?, 'paused', ?, ?)",
        [env.ctx.newId(), id, new Date(from).toISOString(), new Date(from + 250_000).toISOString()],
      );
    }
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toEqual([]);
  });
});

describe('walkAnchor', () => {
  it('is the centre of the longest stop', () => {
    const id = recordWalk(SPOT, 240, 0);
    const anchor = walkAnchor(env.db, id, START + 86_400_000);
    expect(anchor?.lat).toBeCloseTo(SPOT.lat, 4);
    expect(anchor?.lon).toBeCloseTo(SPOT.lon, 4);
  });

  it('falls back to the first point when there is no stop, and to null without a track', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    const t0 = START;
    appendTrackPoints(
      env.db,
      walk.id,
      Array.from({ length: 30 }, (_, i) => ({
        ts: t0 + i * 1000,
        lat: SPOT.lat + i * STEP,
        lon: SPOT.lon,
        accuracyM: 5,
        speedMps: 1.2,
      })),
    );
    finishWalk(env.db, env.ctx, walk.id, t0 + 30_000);
    const anchor = walkAnchor(env.db, walk.id, START + 60_000);
    expect(anchor?.lat).toBeCloseTo(SPOT.lat, 5);
    expect(walkAnchor(env.db, 'nope', START)).toBeNull();
  });
});

describe('linkWalksToPlace', () => {
  it('links only walks that have no place yet', () => {
    const a = recordWalk(SPOT, 240, 0);
    const b = recordWalk(SPOT, 240, 1);
    const place = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...SPOT });
    const other = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: 56,
      lon: 38,
    });
    env.db.run('UPDATE walk SET place_id = ? WHERE id = ?', [other.id, b]);
    expect(linkWalksToPlace(env.db, env.ctx, place.id, [a, b, 'nope'])).toBe(1);
    const row = (id: string) => env.db.all('SELECT place_id FROM walk WHERE id = ?', [id])[0];
    expect(row(a)).toEqual({ place_id: place.id });
    expect(row(b)).toEqual({ place_id: other.id });
    expect(getPlace(env.db, place.id)).not.toBeNull();
  });
});
