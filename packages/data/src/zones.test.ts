import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listWalkDims, refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { createPlace } from './places';
import { placeActivity } from './placeStats';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { effectivePlaceIds, structureZones } from './walkPlace';
import { walkZones } from './walkZones';
import { filterOptions, filterWalks, EMPTY_FILTER } from './walkFilter';

const M_PER_DEG = 111_195;
const LAT0 = 55;
const LON0 = 37;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const DAY = 86_400_000;
const NOW = START + 30 * DAY;

const spot = (x: number, y = 0) => ({
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

/** A GPS walk along the x axis through `stops`: walking 1.3 m/s from one x to the next, a fix every 5 s. */
function gpsWalk(day: number, xs: readonly number[], stayS = 0): string {
  const points: TrackPointInput[] = [];
  let t = START + day * DAY;
  let x = xs[0] ?? 0;
  const fix = () => points.push({ ts: t, ...spot(x), accuracyM: 5, speedMps: 1.3 });
  fix();
  for (const target of xs.slice(1)) {
    const steps = Math.max(1, Math.round(Math.abs(target - x) / 6.5));
    const from = x;
    for (let i = 1; i <= steps; i += 1) {
      t += 5000;
      x = from + ((target - from) * i) / steps;
      fix();
    }
    for (let s = 5; s <= stayS; s += 5) {
      t += 5000;
      fix();
    }
  }
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  env.db.run('UPDATE walk SET started_at = ? WHERE id = ?', [
    new Date(START + day * DAY).toISOString(),
    walk.id,
  ]);
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, t);
  return walk.id;
}

const park = () =>
  createPlace(env.db, env.ctx, {
    name: 'Парк',
    category: 'park',
    label: 'Парк',
    ...spot(1500),
    radiusM: 300,
  });
const home = () =>
  createPlace(env.db, env.ctx, {
    name: 'Дом',
    category: 'home',
    label: 'Дом',
    ...spot(0),
    radiusM: 60,
  });

describe('zones in the derived layer', () => {
  it('out of the door, through the park, to the far end and back through it: two park visits, and the park as its place', () => {
    const p = park();
    const h = home();
    const id = gpsWalk(1, [0, 3000, 0]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const found = structureZones(env.db, dog.id).get(id);
    expect(found?.zones.map((z) => z.placeId)).toEqual([h.id, p.id, p.id, h.id]);
    expect(found?.mainPlaceId).toBe(p.id);
    expect(effectivePlaceIds(env.db, dog.id).get(id)).toBe(p.id);
  });

  it('the place the owner picked wins over the one the track says', () => {
    const p = park();
    const other = createPlace(env.db, env.ctx, {
      name: 'Двор',
      category: 'yard',
      label: 'Двор',
      ...spot(9000),
      radiusM: 40,
    });
    const id = gpsWalk(1, [1000, 2000]);
    env.db.run('UPDATE walk SET place_id = ? WHERE id = ?', [other.id, id]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(structureZones(env.db, dog.id).get(id)?.mainPlaceId).toBe(p.id);
    expect(effectivePlaceIds(env.db, dog.id).get(id)).toBe(other.id);
  });

  it('a walk without a place takes the kind of the place it was in (the dimension of the walk)', () => {
    park();
    const id = gpsWalk(1, [1000, 2000]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const dims = listWalkDims(env.db, dog.id).find((d) => d.walkId === id);
    expect(dims?.dims.dims['place_kind']).toBe('green');
  });

  it('the filter and its options find the walk by the park without anyone picking it', () => {
    const p = park();
    const id = gpsWalk(1, [1000, 2000]);
    gpsWalk(2, [8000, 8500]); // nowhere saved
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(filterOptions(env.db, dog.id).places.map((x) => x.id)).toEqual([p.id]);
    const found = filterWalks(env.db, dog.id, { ...EMPTY_FILTER, placeIds: [p.id] }, NOW);
    expect(found.walks.map((w) => w.id)).toEqual([id]);
  });

  it('a place that is drawn later changes the zones of old walks', () => {
    const id = gpsWalk(1, [1000, 2000]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(structureZones(env.db, dog.id).get(id)?.mainPlaceId).toBeNull();
    env.advance(60_000);
    const p = park();
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(structureZones(env.db, dog.id).get(id)?.mainPlaceId).toBe(p.id);
  });
});

describe('time and events inside a place', () => {
  it('the places of the walks with the time inside, the events in it and a rate once there is an hour', () => {
    const p = park();
    // two long walks that spend most of their time in the park: ~46 minutes inside each
    const a = gpsWalk(1, [1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700]);
    const b = gpsWalk(2, [1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700, 1300, 1700]);
    for (const id of [a, b]) {
      createEvent(env.db, env.ctx, {
        dogId: dog.id,
        walkId: id,
        typeId: 'dog',
        ts: START + (id === a ? 1 : 2) * DAY + 600_000,
        tzOffsetMin: 0,
        incomplete: false,
      });
    }
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const [activity] = placeActivity(env.db, dog.id, NOW, 0);
    expect(activity?.placeId).toBe(p.id);
    expect(activity?.summary.walks).toBe(2);
    expect(activity?.dwellS).toBeGreaterThan(3600);
    expect(activity?.zoneEvents).toBe(2);
    expect(activity?.eventsPerHour).toBeGreaterThan(0.5);
    expect(activity?.eventsPerHour).toBeLessThan(2);
  });

  it('under an hour inside there is no rate, only the time', () => {
    park();
    gpsWalk(1, [1200, 1800, 1200]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const [activity] = placeActivity(env.db, dog.id, NOW, 0);
    expect(activity?.dwellS).toBeGreaterThan(60);
    expect(activity?.eventsPerHour).toBeNull();
  });

  it('home is a place too, but a walk is not "at home" when it spent its time elsewhere', () => {
    home();
    const p = park();
    const id = gpsWalk(1, [0, 1500, 1800, 1500]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(effectivePlaceIds(env.db, dog.id).get(id)).toBe(p.id);
  });
});

describe('walkZones', () => {
  it('the stays of one walk in time order, with the names; a walk with no track has none', () => {
    const p = park();
    const h = home();
    const id = gpsWalk(1, [0, 3000, 0]);
    expect(walkZones(env.db, id).map((z) => z.name)).toEqual(['Дом', 'Парк', 'Парк', 'Дом']);
    expect(walkZones(env.db, id)[1]?.placeId).toBe(p.id);
    expect(walkZones(env.db, id)[0]?.placeId).toBe(h.id);
    expect(walkZones(env.db, id)[1]?.dwellS).toBeGreaterThan(300);
    const empty = startWalk(env.db, env.ctx, { dogId: dog.id });
    finishWalk(env.db, env.ctx, empty.id, START + 1000);
    expect(walkZones(env.db, empty.id)).toEqual([]);
  });
});
