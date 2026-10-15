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

  it('a big saved place covers repeated stops far from its centre', () => {
    // three walks stop about 220 m east of where the owner put the park's pin
    const farSpot = {
      lat: SPOT.lat,
      lon: SPOT.lon + 220 / (111_320 * Math.cos((SPOT.lat * Math.PI) / 180)),
    };
    for (const day of [0, 1, 2]) {
      recordWalk(farSpot, 240, day);
    }
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toHaveLength(1);
    // a park (300 m) pinned at SPOT reaches the stops; a small clearing (50 m) does not
    const park = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...SPOT });
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toEqual([]);
    env.db.run('UPDATE place SET radius_m = 50 WHERE id = ?', [park.id]);
    expect(proposePlaces(env.db, START + 3 * 86_400_000)).toHaveLength(1);
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

/** A deterministic wander inside a disc around a centre, one point per second. */
function wanderTrack(
  centre: { lat: number; lon: number },
  radiusM: number,
  seconds: number,
  seed: number,
  t0: number,
  /** The fraction of the radius after which the walk turns back to the centre. */
  pull = 0.8,
): TrackPointInput[] {
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((centre.lat * Math.PI) / 180);
  let n = 0;
  let e = 0;
  let heading = rand() * Math.PI * 2;
  const points: TrackPointInput[] = [];
  for (let i = 0; i < seconds; i++) {
    heading += (rand() - 0.5) * 1.2;
    if (Math.hypot(n, e) > radiusM * pull) {
      heading = Math.atan2(-n, -e);
    }
    n += Math.sin(heading) * 0.9;
    e += Math.cos(heading) * 0.9;
    points.push({
      ts: t0 + i * 1000,
      lat: centre.lat + n / mPerDegLat,
      lon: centre.lon + e / mPerDegLon,
      accuracyM: 5,
      speedMps: 0.9,
    });
  }
  return points;
}

function recordPoints(points: readonly TrackPointInput[]): string {
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, (points[points.length - 1]?.ts ?? START) + 1000);
  return walk.id;
}

const offsetFrom = (c: { lat: number; lon: number }, north: number, east: number) => ({
  lat: c.lat + north / 111_320,
  lon: c.lon + east / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
});

describe('proposePlaces: places of different size (A-12b)', () => {
  const CLEARING = { lat: 55.7, lon: 37.5 };
  const PARK = { lat: 55.8, lon: 37.6 };

  it('three walks circling the same clearing give one small place of a sensible size', () => {
    for (const [day, [n, e]] of [
      [0, [0, 0]],
      [1, [10, -8]],
      [2, [-12, 9]],
    ] as const) {
      recordPoints(
        wanderTrack(offsetFrom(CLEARING, n, e), 25, 12 * 60, 10 + day, START + day * 86_400_000),
      );
    }
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    expect(found).toHaveLength(1);
    // a clearing: not a doorway and not park-sized
    expect(found[0]?.scale).not.toBe('large');
    expect(found[0]?.walkCount).toBe(3);
    // covers the visits but is not park-sized
    expect(found[0]?.radiusM).toBeGreaterThanOrEqual(40);
    expect(found[0]?.radiusM).toBeLessThan(120);
  });

  it('three long wanders through a big park give one place that covers them', () => {
    // the visits wander over different parts of the park, their centres up to ~60 m apart
    for (const [day, [n, e]] of [
      [0, [0, 0]],
      [1, [30, 20]],
      [2, [-25, 35]],
    ] as const) {
      recordPoints(
        wanderTrack(offsetFrom(PARK, n, e), 200, 25 * 60, 20 + day, START + day * 86_400_000, 0.35),
      );
    }
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    expect(found).toHaveLength(1);
    expect(found[0]?.scale).not.toBe('small');
    // far bigger than a doorway: it has to cover where the visits wandered
    expect(found[0]?.radiusM).toBeGreaterThanOrEqual(90);
    expect(found[0]?.walkCount).toBe(3);
  });

  it('a saved park covers wanders inside it: nothing new is suggested there', () => {
    createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...PARK });
    for (let day = 0; day < 4; day++) {
      recordPoints(
        wanderTrack(
          offsetFrom(PARK, day * 25, -day * 20),
          200,
          25 * 60,
          30 + day,
          START + day * 86_400_000,
        ),
      );
    }
    expect(proposePlaces(env.db, START + 4 * 86_400_000)).toEqual([]);
  });

  it('a clearing outside the saved park is still suggested', () => {
    createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...PARK });
    for (let day = 0; day < 3; day++) {
      recordPoints(
        wanderTrack(offsetFrom(PARK, 900, 900), 20, 10 * 60, 40 + day, START + day * 86_400_000),
      );
    }
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    expect(found).toHaveLength(1);
    expect(found[0]?.scale).toBe('small');
  });

  it('a clearing next to a park wander is its own place, not folded into the park', () => {
    // park-sized wanders at PARK; small circling 700 m away
    for (let day = 0; day < 3; day++) {
      recordPoints(wanderTrack(PARK, 200, 25 * 60, 50 + day, START + day * 86_400_000, 0.35));
      recordPoints(
        wanderTrack(
          offsetFrom(PARK, 700, 0),
          20,
          10 * 60,
          60 + day,
          START + day * 86_400_000 + 5 * 3_600_000,
        ),
      );
    }
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    // the park-sized wanders and the small clearing stay apart (the park's own label follows its spread)
    expect(found).toHaveLength(2);
    expect(found.filter((f) => f.scale === 'small')).toHaveLength(1);
    expect(Math.max(...found.map((f) => f.radiusM))).toBeGreaterThanOrEqual(100);
  });

  it('longest total time first', () => {
    for (let day = 0; day < 3; day++) {
      recordPoints(wanderTrack(PARK, 200, 25 * 60, 70 + day, START + day * 86_400_000, 0.35));
      recordPoints(
        wanderTrack(CLEARING, 20, 8 * 60, 80 + day, START + day * 86_400_000 + 5 * 3_600_000),
      );
    }
    const found = proposePlaces(env.db, START + 3 * 86_400_000);
    expect(found.length).toBe(2);
    expect(found[0]?.totalDurationS).toBeGreaterThan(found[1]?.totalDurationS ?? 0);
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
