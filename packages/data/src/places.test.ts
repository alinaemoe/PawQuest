import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import {
  MAX_PLACE_RADIUS_M,
  MIN_PLACE_RADIUS_M,
  PLACE_CATEGORIES,
  PLACE_DEFAULT_RADIUS_M,
  addAlias,
  createPlace,
  findSimilarPlaces,
  getPlace,
  isBasePlace,
  listPlaces,
  mergePlaces,
  placeAt,
  restorePlaceGeometry,
  setPlaceBoundary,
  setWalkPlace,
  similarPlacePairs,
  topPlaces,
  undoMerge,
  updatePlace,
} from './places';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import { createManualWalk } from './walks';

const HOME = { lat: 55.7558, lon: 37.6173 };
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

const park = (name = 'парк  у дома!!', at = HOME) =>
  createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', name, ...at });

const walkAt = (placeId: string | null, daysAgo: number) => {
  const w = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START - daysAgo * DAY,
    durationS: 1800,
  });
  setWalkPlace(env.db, env.ctx, w.id, { placeId, placeKind: null });
  return w;
};

describe('createPlace', () => {
  it('tidies the name and stores the normalized key and a grid cell', () => {
    const place = park();
    expect(place.name).toBe('Парк у дома');
    const row = env.db.all('SELECT name_norm, geohash8 FROM place')[0];
    expect(row?.['name_norm']).toBe('дома парк');
    expect(String(row?.['geohash8'])).toMatch(/^\d+:\d+$/);
  });

  it('with no usable name it takes the type label, numbered when taken', () => {
    const a = park('');
    const b = park('   ');
    const c = park('🙂');
    expect([a.name, b.name, c.name]).toEqual(['Парк', 'Парк 2', 'Парк 3']);
  });

  it('the default radius follows the type: a park is big, a clearing small', () => {
    const radius = (category: 'park' | 'meadow' | 'yard' | 'forest' | 'other') =>
      createPlace(env.db, env.ctx, { category, label: 'X', ...HOME }).radiusM;
    expect([
      radius('park'),
      radius('forest'),
      radius('meadow'),
      radius('yard'),
      radius('other'),
    ]).toEqual([
      PLACE_DEFAULT_RADIUS_M.park,
      PLACE_DEFAULT_RADIUS_M.forest,
      PLACE_DEFAULT_RADIUS_M.meadow,
      PLACE_DEFAULT_RADIUS_M.yard,
      PLACE_DEFAULT_RADIUS_M.other,
    ]);
    expect(PLACE_DEFAULT_RADIUS_M.park).toBeGreaterThan(PLACE_DEFAULT_RADIUS_M.meadow * 4);
  });

  it('every type has a default size inside the allowed range, and big places are bigger', () => {
    for (const category of PLACE_CATEGORIES) {
      const size = PLACE_DEFAULT_RADIUS_M[category];
      expect(size, category).toBeGreaterThanOrEqual(MIN_PLACE_RADIUS_M);
      expect(size, category).toBeLessThanOrEqual(MAX_PLACE_RADIUS_M);
    }
    expect(PLACE_DEFAULT_RADIUS_M.park).toBeGreaterThan(PLACE_DEFAULT_RADIUS_M.square);
    expect(PLACE_DEFAULT_RADIUS_M.square).toBeGreaterThan(PLACE_DEFAULT_RADIUS_M.meadow);
    expect(PLACE_DEFAULT_RADIUS_M.meadow).toBeGreaterThan(PLACE_DEFAULT_RADIUS_M.yard);
  });

  it('only home and guests are bases', () => {
    expect(PLACE_CATEGORIES.filter((c) => isBasePlace(c))).toEqual(['home', 'guests']);
  });

  it('the new types can be saved and read back', () => {
    for (const category of ['square', 'alley', 'shop', 'grooming', 'home', 'guests'] as const) {
      const place = createPlace(env.db, env.ctx, { category, label: category, ...HOME });
      expect(getPlace(env.db, place.id)?.category).toBe(category);
    }
  });

  it('keeps a chosen radius within 15 to 1000 m', () => {
    const radius = (r: number) =>
      createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...HOME, radiusM: r })
        .radiusM;
    expect([radius(5), radius(2000), radius(326.4)]).toEqual([
      MIN_PLACE_RADIUS_M,
      MAX_PLACE_RADIUS_M,
      326,
    ]);
  });

  it('rejects an impossible position', () => {
    expect(() =>
      createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 91, lon: 0 }),
    ).toThrow(RangeError);
  });
});

describe('listPlaces and topPlaces', () => {
  it('counts completed walks only and orders by visits, then recency', () => {
    const a = park('Парк у дома');
    const b = park('Луг за школой', { lat: 55.77, lon: 37.64 });
    const c = park('Двор', { lat: 55.78, lon: 37.65 });
    walkAt(a.id, 5);
    walkAt(b.id, 2);
    walkAt(b.id, 1);
    walkAt(c.id, 0);
    const discarded = walkAt(a.id, 3);
    env.db.run("UPDATE walk SET status = 'discarded' WHERE id = ?", [discarded.id]);
    const deleted = walkAt(a.id, 4);
    softDelete(env.db, env.ctx, 'walk', deleted.id);
    const list = listPlaces(env.db);
    expect(list.map((p) => [p.name, p.visits])).toEqual([
      ['Луг за школой', 2],
      ['Двор', 1],
      ['Парк у дома', 1],
    ]);
    expect(list[2]?.lastVisitAt).toBe(START - 5 * DAY);
    expect(topPlaces(env.db, 2).map((p) => p.name)).toEqual(['Луг за школой', 'Двор']);
  });

  it('a place without walks has no last visit; deleted places are hidden', () => {
    const a = park();
    expect(listPlaces(env.db)[0]).toMatchObject({ visits: 0, lastVisitAt: null });
    softDelete(env.db, env.ctx, 'place', a.id);
    expect(listPlaces(env.db)).toEqual([]);
    expect(getPlace(env.db, a.id)).toBeNull();
  });
});

describe('placeAt', () => {
  it('finds the place whose radius holds the position; of nested places the smallest wins', () => {
    const big = park('Парк у дома');
    const yard = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: HOME.lat + 0.0003,
      lon: HOME.lon,
      radiusM: 100,
    });
    // both hold the position: the yard is smaller, so it is "the place" here
    expect(placeAt(env.db, { lat: HOME.lat + 0.00005, lon: HOME.lon })?.id).toBe(yard.id);
    // only the park holds this one
    expect(placeAt(env.db, { lat: HOME.lat - 0.002, lon: HOME.lon })?.id).toBe(big.id);
    expect(placeAt(env.db, { lat: HOME.lat + 0.01, lon: HOME.lon })).toBeNull();
  });

  it('of equal places the nearest wins', () => {
    const a = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      ...HOME,
      radiusM: 100,
    });
    const b = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: HOME.lat + 0.0006,
      lon: HOME.lon,
      radiusM: 100,
    });
    expect(placeAt(env.db, { lat: HOME.lat + 0.0001, lon: HOME.lon })?.id).toBe(a.id);
    expect(placeAt(env.db, { lat: HOME.lat + 0.0005, lon: HOME.lon })?.id).toBe(b.id);
  });

  it('uses at least 40 m even for a small radius', () => {
    createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...HOME, radiusM: 25 });
    // 0.00031 degrees of latitude is 34 m
    expect(placeAt(env.db, { lat: HOME.lat + 0.00031, lon: HOME.lon })).not.toBeNull();
    expect(placeAt(env.db, { lat: HOME.lat + 0.0005, lon: HOME.lon })).toBeNull();
  });
});

describe('updatePlace and aliases', () => {
  it('renames, retypes and keeps the old name as an alias', () => {
    const a = park('Парк у дома');
    const updated = updatePlace(env.db, env.ctx, a.id, {
      name: 'Сквер у реки',
      category: 'waterfront',
      radiusM: 90,
      notes: 'утки',
    });
    expect(updated).toMatchObject({
      name: 'Сквер у реки',
      category: 'waterfront',
      radiusM: 90,
      notes: 'утки',
    });
    // the old name now leads to the same place
    expect(findSimilarPlaces(env.db, 'парк у дома')[0]).toMatchObject({
      reason: 'alias',
      place: { id: a.id },
    });
  });

  it('keeps the old name when the new one is empty, and does not alias the same name', () => {
    const a = park('Парк у дома');
    expect(updatePlace(env.db, env.ctx, a.id, { name: '🙂' }).name).toBe('Парк у дома');
    updatePlace(env.db, env.ctx, a.id, { name: 'парк у дома' });
    expect(env.db.all('SELECT 1 FROM place_alias')).toHaveLength(0);
  });

  it('addAlias ignores empty text, unknown places and the place name', () => {
    const a = park('Парк у дома');
    addAlias(env.db, env.ctx, a.id, '🙂');
    addAlias(env.db, env.ctx, 'nope', 'Что-то');
    addAlias(env.db, env.ctx, a.id, 'Парк у дома');
    expect(env.db.all('SELECT 1 FROM place_alias')).toHaveLength(0);
  });

  it('updating a missing place says so', () => {
    expect(() => updatePlace(env.db, env.ctx, 'nope', { name: 'x' })).toThrow('Place not found');
  });
});

describe('findSimilarPlaces and similarPlacePairs', () => {
  it('finds a near-identical name and, for the same type, a place at the same spot', () => {
    const a = park('Парк у дома');
    expect(findSimilarPlaces(env.db, 'парк дома')[0]?.place.id).toBe(a.id);
    const byGeo = findSimilarPlaces(env.db, 'Совсем другое', { category: 'park', point: HOME });
    expect(byGeo[0]).toMatchObject({ reason: 'geo', place: { id: a.id } });
    expect(findSimilarPlaces(env.db, 'Совсем другое', { category: 'forest', point: HOME })).toEqual(
      [],
    );
  });

  it('lists each look-alike pair once, the more visited place first', () => {
    const a = park('Парк у дома');
    const b = park('Парк дома', { lat: HOME.lat + 0.001, lon: HOME.lon });
    createPlace(env.db, env.ctx, {
      category: 'forest',
      label: 'Лес',
      name: 'Лес',
      lat: 56,
      lon: 38,
    });
    walkAt(b.id, 1);
    walkAt(b.id, 2);
    walkAt(a.id, 3);
    const pairs = similarPlacePairs(env.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.keep.id).toBe(b.id);
    expect(pairs[0]?.other.id).toBe(a.id);
  });
});

describe('mergePlaces and undoMerge', () => {
  it('moves walks, events and sessions over, aliases the name and trashes the source', () => {
    const keep = park('Парк у дома');
    const dup = park('Парк дома', { lat: HOME.lat + 0.001, lon: HOME.lon });
    const w = walkAt(dup.id, 1);
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'toilet',
      tzOffsetMin: 0,
      incomplete: false,
    });
    env.db.run('UPDATE event SET place_id = ? WHERE id = ?', [dup.id, event.id]);
    env.db.run('INSERT INTO place_alias (alias_norm, place_id, created_at) VALUES (?, ?, ?)', [
      'сквер',
      dup.id,
      'x',
    ]);

    const record = mergePlaces(env.db, env.ctx, dup.id, keep.id);
    expect(record.walkIds).toEqual([w.id]);
    expect(record.eventIds).toEqual([event.id]);
    expect(record.movedAliases).toEqual(['сквер']);
    expect(getPlace(env.db, dup.id)).toBeNull();
    expect(listPlaces(env.db).find((p) => p.id === keep.id)?.visits).toBe(1);
    expect(findSimilarPlaces(env.db, 'сквер')[0]?.place.id).toBe(keep.id);
    expect(findSimilarPlaces(env.db, 'парк дома')[0]?.place.id).toBe(keep.id);
  });

  it('undo puts everything back', () => {
    const keep = park('Парк у дома');
    const dup = park('Парк дома', { lat: HOME.lat + 0.001, lon: HOME.lon });
    const w = walkAt(dup.id, 1);
    env.db.run('INSERT INTO place_alias (alias_norm, place_id, created_at) VALUES (?, ?, ?)', [
      'сквер',
      dup.id,
      'x',
    ]);
    const record = mergePlaces(env.db, env.ctx, dup.id, keep.id);
    undoMerge(env.db, env.ctx, dup.id, keep.id, record);
    expect(getPlace(env.db, dup.id)).not.toBeNull();
    const visits = Object.fromEntries(listPlaces(env.db).map((p) => [p.id, p.visits]));
    expect(visits).toEqual({ [keep.id]: 0, [dup.id]: 1 });
    expect(env.db.all('SELECT alias_norm, place_id FROM place_alias')).toEqual([
      { alias_norm: 'сквер', place_id: dup.id },
    ]);
    expect(w.id).toBeTruthy();
  });

  it('refuses to merge a place into itself or a missing place', () => {
    const a = park();
    expect(() => mergePlaces(env.db, env.ctx, a.id, a.id)).toThrow('itself');
    expect(() => mergePlaces(env.db, env.ctx, a.id, 'nope')).toThrow('Place not found');
  });
});

describe('setWalkPlace', () => {
  it('sets a saved place, only a type, or clears both', () => {
    const a = park();
    const w = walkAt(null, 1);
    setWalkPlace(env.db, env.ctx, w.id, { placeId: a.id, placeKind: null });
    expect(env.db.all('SELECT place_id, place_kind FROM walk WHERE id = ?', [w.id])[0]).toEqual({
      place_id: a.id,
      place_kind: null,
    });
    setWalkPlace(env.db, env.ctx, w.id, { placeId: null, placeKind: 'meadow' });
    expect(env.db.all('SELECT place_id, place_kind FROM walk WHERE id = ?', [w.id])[0]).toEqual({
      place_id: null,
      place_kind: 'meadow',
    });
  });
});

describe('place contours (spike S8)', () => {
  const M_PER_DEG = 111_195;
  const COS = Math.cos((55 * Math.PI) / 180);
  const at = (x: number, y: number) => ({
    lat: 55 + y / M_PER_DEG,
    lon: 37 + x / (M_PER_DEG * COS),
  });
  const park = [at(0, 0), at(600, 0), at(600, 500), at(0, 500)]; // 30 ha

  it('a contour moves the centre and the radius of the place with it', () => {
    const place = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...at(10, 10) });
    const shaped = setPlaceBoundary(env.db, env.ctx, place.id, park, 'osm');
    expect(shaped.boundary).toHaveLength(4);
    expect(shaped.boundarySource).toBe('osm');
    expect(Math.abs(shaped.lat - at(300, 250).lat)).toBeLessThan(0.0001);
    expect(shaped.radiusM).toBeGreaterThan(380);
    expect(shaped.radiusM).toBeLessThan(400);
    expect(getPlace(env.db, place.id)?.boundary).toEqual(shaped.boundary);
  });

  it('placeAt follows the contour, not the circle: a corner far from the centre is inside', () => {
    const place = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      ...at(300, 250),
    });
    expect(placeAt(env.db, at(10, 10))).toBeNull(); // 390 m from the centre, outside the 300 m circle
    setPlaceBoundary(env.db, env.ctx, place.id, park);
    expect(placeAt(env.db, at(10, 10))?.id).toBe(place.id);
    expect(placeAt(env.db, at(-10, 250))?.id).toBe(place.id); // a few meters past the fence still counts
    expect(placeAt(env.db, at(-60, 250))).toBeNull();
  });

  it('a glade inside the park wins where both contain the position', () => {
    const big = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...at(300, 250) });
    setPlaceBoundary(env.db, env.ctx, big.id, park);
    const glade = createPlace(env.db, env.ctx, {
      category: 'meadow',
      label: 'Полянка',
      ...at(300, 250),
      radiusM: 50,
    });
    expect(placeAt(env.db, at(310, 250))?.id).toBe(glade.id);
    expect(placeAt(env.db, at(100, 100))?.id).toBe(big.id);
  });

  it('takes the contour away, and the radius rules again', () => {
    const place = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      ...at(300, 250),
    });
    setPlaceBoundary(env.db, env.ctx, place.id, park);
    const plain = setPlaceBoundary(env.db, env.ctx, place.id, null);
    expect(plain.boundary).toBeNull();
    expect(plain.boundarySource).toBeNull();
  });

  it('puts the geometry back as it was (the undo of a contour)', () => {
    const before = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      ...at(10, 10),
      radiusM: 120,
    });
    setPlaceBoundary(env.db, env.ctx, before.id, park, 'osm');
    const restored = restorePlaceGeometry(env.db, env.ctx, before);
    expect(restored).toEqual(before);
    expect(placeAt(env.db, at(500, 450))).toBeNull();
    const shaped = setPlaceBoundary(env.db, env.ctx, before.id, park);
    expect(restorePlaceGeometry(env.db, env.ctx, shaped).boundary).toHaveLength(4);
    expect(() => restorePlaceGeometry(env.db, env.ctx, { ...before, id: 'nope' })).toThrow();
  });

  it('refuses a ring that is not a contour and a place that is gone', () => {
    const place = createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', ...at(0, 0) });
    expect(() => setPlaceBoundary(env.db, env.ctx, place.id, [at(0, 0), at(50, 0)])).toThrow(
      RangeError,
    );
    expect(() => setPlaceBoundary(env.db, env.ctx, 'nope', park)).toThrow();
  });

  it('a stay inside the contour is not proposed as a new place', () => {
    const place = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      ...at(300, 250),
    });
    setPlaceBoundary(env.db, env.ctx, place.id, park);
    expect(placeAt(env.db, at(580, 480))?.id).toBe(place.id);
  });
});
