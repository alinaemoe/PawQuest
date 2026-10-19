import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { createPlace, setWalkPlace } from './places';
import { START, testEnv, type TestEnv } from './test-utils';
import { addAttempt, createSkill, finishSession, startSession } from './training';
import {
  EMPTY_FILTER,
  countConditions,
  deleteFolder,
  filterFacets,
  filterOptions,
  filterWalks,
  listFolders,
  parseFilter,
  saveFolder,
  type WalkFilter,
} from './walkFilter';
import { createManualWalk } from './walks';
import { saveWeatherSnapshot } from './weather';
import type { WeatherFacts } from '@pawquest/weather';

const DAY = 86_400_000;
const NOW = START + 40 * DAY;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const facts = (extra: Partial<WeatherFacts> = {}): WeatherFacts => ({
  at: START,
  gridDistanceKm: 1,
  tempC: 8,
  apparentC: 6,
  humidityPct: 70,
  windMs: 2,
  gustMs: 4,
  code: 1,
  isDay: true,
  rain3hMm: 0,
  rain24hMm: 0,
  rain72hMm: 0,
  snow24hCm: 0,
  raining: false,
  nextRainMin: null,
  lastRainAt: null,
  surfaceTempC: 12,
  soilMoisture: 0.2,
  uv: 1,
  sunrise: null,
  sunset: null,
  daylightLeftMin: 300,
  untilSunriseMin: null,
  aqi: 25,
  pm25: 5,
  pollen: [],
  ...extra,
});

function walk(
  day: number,
  minutes: number,
  extra: { placeId?: string; weather?: Partial<WeatherFacts> } = {},
): string {
  const id = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
  }).id;
  if (extra.placeId !== undefined) {
    setWalkPlace(env.db, env.ctx, id, { placeId: extra.placeId, placeKind: null });
  }
  if (extra.weather !== undefined) {
    saveWeatherSnapshot(env.db, id, facts(extra.weather));
  }
  return id;
}

const ids = (filter: Partial<WalkFilter>): string[] =>
  filterWalks(env.db, dog.id, { ...EMPTY_FILTER, ...filter }, NOW).walks.map((w) => w.id);

describe('filterWalks', () => {
  it('no conditions: every walk of two minutes or more, newest first', () => {
    const a = walk(1, 30);
    const b = walk(2, 30);
    walk(3, 1); // under two minutes
    expect(ids({})).toEqual([b, a]);
  });

  it('the period keeps the last days only', () => {
    walk(5, 30);
    const recent = walk(35, 30);
    expect(ids({ days: 10 })).toEqual([recent]);
  });

  it('the place: any of the chosen saved places', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    const yard = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: 55.5,
      lon: 37,
    });
    const a = walk(1, 30, { placeId: park.id });
    const b = walk(2, 30, { placeId: yard.id });
    walk(3, 30);
    expect(ids({ placeIds: [park.id] })).toEqual([a]);
    expect(ids({ placeIds: [park.id, yard.id] })).toEqual([b, a]);
  });

  it('weather, light and kind of place come from the worked-out walks; the rest are "not yet"', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    const wet = walk(1, 30, { placeId: park.id, weather: { raining: true } });
    walk(2, 30, { placeId: park.id, weather: {} });
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    walk(3, 30, { placeId: park.id, weather: { raining: true } }); // not worked out yet
    const result = filterWalks(env.db, dog.id, { ...EMPTY_FILTER, dims: { ground: ['wet'] } }, NOW);
    expect(result.walks.map((w) => w.id)).toEqual([wet]);
    expect(result.pending).toBe(1);
    expect(ids({ dims: { place_kind: ['green'], ground: ['wet', 'dry'] } })).toHaveLength(2);
    expect(ids({ dims: { ground: [] } })).toHaveLength(3); // an empty condition is no condition
  });

  it('an event of a chosen kind, a hard moment or a success, a training during the walk', () => {
    const a = walk(1, 30);
    const b = walk(2, 30);
    const c = walk(3, 30);
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: a,
      typeId: 'dog',
      tzOffsetMin: 0,
      incomplete: false,
    });
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: b,
      typeId: 'hard',
      tzOffsetMin: 0,
      incomplete: false,
    });
    const skill = createSkill(env.db, env.ctx, {
      dogId: dog.id,
      name: 'Ко мне',
      levels: [{ title: '5 м' }],
    });
    const session = startSession(env.db, env.ctx, dog.id, skill.id, { walkId: c });
    addAttempt(env.db, env.ctx, session.id, 'successful');
    finishSession(env.db, env.ctx, session.id);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    expect(ids({ eventTypes: ['dog'] })).toEqual([a]);
    expect(ids({ eventTypes: ['dog', 'hard'] })).toEqual([b, a]);
    expect(ids({ outcomes: ['hard_moment'] })).toEqual([b]);
    expect(ids({ training: true })).toEqual([c]);
  });

  it('conditions together: all of them have to hold', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    walk(1, 30, { placeId: park.id });
    const both = walk(30, 30, { placeId: park.id });
    walk(31, 30);
    expect(ids({ placeIds: [park.id], days: 15 })).toEqual([both]);
  });

  it('the answer is cut at the limit', () => {
    walk(1, 30);
    walk(2, 30);
    expect(filterWalks(env.db, dog.id, EMPTY_FILTER, NOW, 1).walks).toHaveLength(1);
  });
});

describe('conditions and folders', () => {
  it('conditions are counted: the period, each group of values, the switches', () => {
    expect(countConditions(EMPTY_FILTER)).toBe(0);
    expect(
      countConditions({
        days: 30,
        placeIds: ['a', 'b'],
        dims: { ground: ['wet'], light: [] },
        eventTypes: ['dog'],
        outcomes: ['success'],
        training: true,
      }),
    ).toBe(6);
  });

  it('a folder is saved, listed and deleted; a bad name is refused', () => {
    const filter: WalkFilter = { ...EMPTY_FILTER, days: 30, dims: { ground: ['wet'] } };
    const folder = saveFolder(env.db, env.ctx, '  Мокрые за месяц ', filter);
    expect(folder.name).toBe('Мокрые за месяц');
    expect(listFolders(env.db)).toEqual([{ id: folder.id, name: 'Мокрые за месяц', filter }]);
    expect(() => saveFolder(env.db, env.ctx, '   ', filter)).toThrow(RangeError);
    expect(deleteFolder(env.db, folder.id)).toBe(true);
    expect(deleteFolder(env.db, folder.id)).toBe(false);
    expect(listFolders(env.db)).toEqual([]);
  });

  it('what another version wrote is read as far as it can be; an unreadable folder is skipped', () => {
    expect(parseFilter(null)).toEqual(EMPTY_FILTER);
    expect(
      parseFilter({
        days: -3,
        placeIds: ['a', 1],
        dims: { ground: ['wet'], light: [] },
        outcomes: ['success', 'x'],
        training: 'yes',
        extra: true,
      }),
    ).toEqual({
      ...EMPTY_FILTER,
      placeIds: ['a'],
      dims: { ground: ['wet'] },
      outcomes: ['success'],
    });
    env.db.run(
      "INSERT INTO saved_filter (id, name, definition, created_at, updated_at) VALUES ('bad', 'Битая', '{not json', 'x', 'x')",
    );
    expect(listFolders(env.db)).toEqual([]);
  });

  it('the options are the places and the kinds of event that occur for the dog', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    createPlace(env.db, env.ctx, { category: 'yard', label: 'Двор', lat: 55.5, lon: 37 }); // never walked
    const id = walk(1, 30, { placeId: park.id });
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: id,
      typeId: 'dog',
      tzOffsetMin: 0,
      incomplete: false,
    });
    const options = filterOptions(env.db, dog.id);
    expect(options.places).toHaveLength(1);
    expect(options.places[0]?.id).toBe(park.id);
    expect(options.eventTypes).toEqual(['dog']);
  });
});

describe('filterFacets', () => {
  it('what each option would give, the totals, and the other conditions kept', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    walk(1, 30, { placeId: park.id, weather: { raining: true } });
    walk(2, 30, { placeId: park.id, weather: {} });
    walk(3, 45, { weather: {} });
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const options = filterOptions(env.db, dog.id);
    const all = filterFacets(env.db, dog.id, EMPTY_FILTER, options, NOW);
    expect(all.total).toBe(3);
    expect(all.durationS).toBe((30 + 30 + 45) * 60);
    expect(all.dims['ground']).toMatchObject({ dry: 2, wet: 1, damp: 0, snow: 0 });
    expect(all.periods).toMatchObject({ all: 3, '7': 0 });
    expect(all.places[park.id]).toBe(2);
    expect(all.training).toBe(0);
    const narrowed = filterFacets(
      env.db,
      dog.id,
      { ...EMPTY_FILTER, placeIds: [park.id] },
      options,
      NOW,
    );
    expect(narrowed.total).toBe(2);
    expect(narrowed.dims['ground']).toMatchObject({ dry: 1, wet: 1 });
    // the group of the option itself is reduced to that option, not added to
    const wet = filterFacets(
      env.db,
      dog.id,
      { ...EMPTY_FILTER, dims: { ground: ['wet'] } },
      options,
      NOW,
    );
    expect(wet.dims['ground']).toMatchObject({ dry: 2, wet: 1 });
  });
});
