import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createPlace, setWalkPlace } from './places';
import { START, testEnv, type TestEnv } from './test-utils';
import { walkUsual, weatherUsual } from './usual';
import { saveWeatherSnapshot } from './weather';
import type { WeatherFacts } from '@pawquest/weather';
import { createManualWalk } from './walks';

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

const park = () =>
  createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 55, lon: 37 });
const yard = () =>
  createPlace(env.db, env.ctx, { category: 'yard', label: 'Двор', lat: 55.5, lon: 37 });

function walk(day: number, minutes: number, placeId: string | null, distanceM?: number): string {
  const id = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
    ...(distanceM === undefined ? {} : { distanceM }),
  }).id;
  if (placeId !== null) {
    setWalkPlace(env.db, env.ctx, id, { placeId, placeKind: null });
  }
  return id;
}

const settle = () => refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });

describe('walkUsual', () => {
  it('a long walk against the usual of walks in the same kind of place', () => {
    const p = park().id;
    [25, 28, 30, 32, 35, 29, 31].forEach((m, i) => walk(i, m, p));
    const target = walk(10, 45, p);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual).toMatchObject({ keys: ['place_kind'], widened: false, circleSize: 7 });
    expect(usual?.duration?.usual).toMatchObject({ n: 7, median: 30 * 60 });
    expect(usual?.duration?.comparison).toEqual({ kind: 'longer', diff: 15 * 60 });
    expect(usual?.duration?.value).toBe(45 * 60);
  });

  it('a walk like the others is the usual, and the walk itself is not in its own usual', () => {
    const p = park().id;
    const ids = [30, 30, 30, 30, 30, 31].map((m, i) => walk(i, m, p));
    settle();
    const usual = walkUsual(env.db, dog.id, ids[5] ?? '');
    expect(usual?.duration?.usual.n).toBe(5);
    expect(usual?.duration?.comparison.kind).toBe('usual');
  });

  it('too few in the same kind of place: it widens to any walk and says so', () => {
    const p = park().id;
    const y = yard().id;
    [30, 32, 28].forEach((m, i) => walk(i, m, p));
    [20, 22, 25, 18].forEach((m, i) => walk(5 + i, m, y));
    const target = walk(20, 31, p);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual).toMatchObject({ keys: [], widened: true, circleSize: 7 });
  });

  it('too few walks anywhere, a walk not worked out yet, an unknown walk: nothing is said', () => {
    const p = park().id;
    const early = walk(0, 30, p);
    [1, 2, 3].forEach((d) => walk(d, 30, p));
    settle();
    expect(walkUsual(env.db, dog.id, early)).toBeNull();
    const fresh = walk(9, 30, p);
    expect(walkUsual(env.db, dog.id, fresh)).toBeNull(); // not worked out yet
    expect(walkUsual(env.db, dog.id, 'nope')).toBeNull();
  });

  it('a walk shorter than two minutes is no walk: not compared and not compared with', () => {
    const p = park().id;
    [30, 30, 30, 30, 30].forEach((m, i) => walk(i, m, p));
    const slip = walk(7, 1, p);
    const target = walk(8, 30, p);
    settle();
    expect(walkUsual(env.db, dog.id, slip)).toBeNull();
    expect(walkUsual(env.db, dog.id, target)?.circleSize).toBe(5);
  });

  it('a measure the circle has too few values for is left out, not guessed', () => {
    const p = park().id;
    [30, 30, 30, 30, 30].forEach((m, i) => walk(i, m, p, i < 3 ? 2000 : undefined));
    const target = walk(9, 30, p, 2500);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual?.duration).not.toBeNull();
    expect(usual?.distance).toBeNull(); // only three of the five have a distance
    expect(usual?.pace).toBeNull(); // walks by hand have no moving time
  });

  it('distance is compared when enough walks have one', () => {
    const p = park().id;
    [1800, 2000, 2200, 2100, 1900].forEach((d, i) => walk(i, 30, p, d));
    const target = walk(9, 30, p, 3200);
    settle();
    const usual = walkUsual(env.db, dog.id, target);
    expect(usual?.distance?.usual.median).toBe(2000);
    expect(usual?.distance?.comparison).toEqual({ kind: 'longer', diff: 1200 });
  });
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

describe('weatherUsual', () => {
  const dayWith = (minutes: number, weather: Partial<WeatherFacts>, day: number) => {
    const id = walk(day, minutes, null);
    saveWeatherSnapshot(env.db, id, facts(weather));
    return id;
  };

  it('in weather like today: how many walks and how long they usually lasted', () => {
    [25, 28, 30, 32, 35, 29].forEach((m, i) => dayWith(m, { rain24hMm: 5 }, i));
    [60, 70, 50].forEach((m, i) => dayWith(m, {}, 10 + i));
    settle();
    const found = weatherUsual(env.db, dog.id, facts({ rain24hMm: 6, tempC: 7 }));
    expect(found).toMatchObject({
      keys: ['ground', 'temp', 'light'],
      values: { ground: 'wet', temp: '0_10', light: 'day' },
      widened: false,
      circleSize: 6,
    });
    expect(found?.duration?.median).toBe(29.5 * 60);
  });

  it('widens when few are exactly like it, and says nothing when almost none are', () => {
    [25, 28, 30].forEach((m, i) => dayWith(m, { rain24hMm: 5, tempC: 8 }, i));
    [31, 33, 35].forEach((m, i) => dayWith(m, { rain24hMm: 5, tempC: 15 }, 5 + i));
    settle();
    expect(weatherUsual(env.db, dog.id, facts({ rain24hMm: 6, tempC: 7 }))).toMatchObject({
      keys: ['ground'],
      widened: true,
      circleSize: 6,
    });
    expect(weatherUsual(env.db, dog.id, facts({ tempC: -15, snow24hCm: 3 }))).toBeNull();
  });
});
