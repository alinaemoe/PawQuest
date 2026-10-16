import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WeatherFacts } from '@pawquest/weather';

import { refreshDerived } from './derived';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { chartData, periodComparison } from './periods';
import { createPlace, setWalkPlace } from './places';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';
import { saveWeatherSnapshot } from './weather';

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

const parkId = (): string =>
  createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 55, lon: 37 }).id;

function walk(day: number, minutes: number, placeId: string, hard: boolean): string {
  const id = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
    distanceM: 1000,
  }).id;
  setWalkPlace(env.db, env.ctx, id, { placeId, placeKind: null });
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    walkId: id,
    typeId: hard ? 'hard' : 'dog',
    ts: START + day * DAY + 300_000,
    tzOffsetMin: 0,
    incomplete: false,
  });
  return id;
}

const settle = () => refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });

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

describe('periodComparison', () => {
  it('the last days against the days before them, outcomes from the derived layer', () => {
    const p = parkId();
    for (let i = 0; i < 8; i += 1) {
      walk(27 + i, 30, p, i < 6);
      walk(13 + i, 20, p, i < 1);
    }
    settle();
    const result = periodComparison(env.db, dog.id, NOW, 14);
    const row = (key: string) => result.rows.find((r) => r.key === key);
    expect(row('walks')).toMatchObject({ a: 8, b: 8, diff: 0 });
    expect(row('time')).toMatchObject({ a: 8 * 1800, b: 8 * 1200 });
    expect(row('hard')).toMatchObject({ a: 0.75, b: 0.125, nA: 8, nB: 8 });
    expect(result.b.toTs).toBe(result.a.fromTs);
  });

  it('a walk not worked out yet and a walk of unknown length are still counted as walks', () => {
    const p = parkId();
    for (let i = 0; i < 6; i += 1) {
      walk(30 + i, 30, p, false);
    }
    settle();
    walk(37, 30, p, true); // not worked out yet
    const open = walk(38, 30, p, false);
    env.db.run('UPDATE walk SET duration_s = NULL, distance_m = NULL WHERE id = ?', [open]);
    const rows = periodComparison(env.db, dog.id, NOW, 14).rows;
    expect(rows.find((r) => r.key === 'walks')?.a).toBe(8);
    expect(rows.find((r) => r.key === 'hard')).toMatchObject({ nA: 6, a: 0 });
    const data = chartData(env.db, dog.id, NOW, 0);
    expect(data.weeks.reduce((sum, w) => sum + w.walks, 0)).toBe(8);
    expect(data.tempBands).toEqual([]);
  });

  it('with no walks nothing fails', () => {
    const rows = periodComparison(env.db, dog.id, NOW, 7).rows;
    expect(rows.find((r) => r.key === 'walks')).toMatchObject({ a: 0, b: 0 });
  });
});

describe('chartData', () => {
  it('weeks, durations by temperature band and hard moments by kind of place', () => {
    const p = parkId();
    for (let i = 0; i < 6; i += 1) {
      const id = walk(30 + i, 30 + i, p, i < 2);
      saveWeatherSnapshot(env.db, id, facts({ tempC: 8, rain24hMm: i < 3 ? 5 : 0 }));
    }
    settle();
    const data = chartData(env.db, dog.id, NOW, 0);
    expect(data.weeks).toHaveLength(12);
    expect(data.weeks.reduce((sum, w) => sum + w.walks, 0)).toBe(6);
    expect(data.weeks.reduce((sum, w) => sum + w.wetDurationS, 0)).toBeGreaterThan(0);
    expect(data.tempBands).toMatchObject([{ value: '0_10', n: 6, enough: true }]);
    expect(data.placeKinds).toMatchObject([{ value: 'green', k: 2, n: 6, enough: true }]);
  });

  it('with no walks every chart is empty and nothing fails', () => {
    const data = chartData(env.db, dog.id, NOW, 0);
    expect(data.tempBands).toEqual([]);
    expect(data.placeKinds).toEqual([]);
    expect(data.weeks.every((w) => w.walks === 0)).toBe(true);
  });
});
