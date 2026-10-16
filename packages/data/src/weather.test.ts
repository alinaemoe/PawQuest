import type { WeatherFacts } from '@pawquest/weather';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog } from './dogs';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';
import { getWeatherSnapshot, saveWeatherSnapshot } from './weather';

let env: TestEnv;
let walkId: string;
beforeEach(() => {
  env = testEnv();
  const dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
  walkId = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START,
    durationS: 1800,
  }).id;
});
afterEach(() => {
  env.db.close();
});

const facts = (extra: Partial<WeatherFacts> = {}): WeatherFacts => ({
  at: START,
  gridDistanceKm: 4.1,
  tempC: 7.5,
  apparentC: 5,
  humidityPct: 80,
  windMs: 3,
  gustMs: 7,
  code: 61,
  isDay: true,
  rain3hMm: 0.6,
  rain24hMm: 4.2,
  rain72hMm: 9,
  snow24hCm: 0,
  raining: true,
  nextRainMin: null,
  lastRainAt: null,
  surfaceTempC: 6,
  soilMoisture: 0.41,
  uv: 0.5,
  sunrise: START - 5 * 3_600_000,
  sunset: START + 4 * 3_600_000,
  daylightLeftMin: 240,
  untilSunriseMin: null,
  aqi: 31,
  pm25: 9,
  pollen: [{ species: 'birch', grains: 12 }],
  ...extra,
});

describe('weather snapshot', () => {
  it('round-trips the full facts', () => {
    saveWeatherSnapshot(env.db, walkId, facts());
    expect(getWeatherSnapshot(env.db, walkId)).toEqual(facts());
  });

  it('also fills the basic columns', () => {
    saveWeatherSnapshot(env.db, walkId, facts());
    const row = env.db.all('SELECT * FROM weather_snapshot WHERE walk_id = ?', [walkId])[0];
    expect(row).toMatchObject({ temp_c: 7.5, apparent_c: 5, wind_mps: 3, code: 61, aqi: 31 });
    expect(row?.['sunrise']).toBe(new Date(START - 5 * 3_600_000).toISOString());
  });

  it('keeps nulls for missing sun times', () => {
    saveWeatherSnapshot(env.db, walkId, facts({ sunrise: null, sunset: null }));
    const row = env.db.all('SELECT sunrise, sunset FROM weather_snapshot', [])[0];
    expect(row).toEqual({ sunrise: null, sunset: null });
  });

  it('a second save replaces the first', () => {
    saveWeatherSnapshot(env.db, walkId, facts());
    saveWeatherSnapshot(env.db, walkId, facts({ tempC: 9 }));
    expect(getWeatherSnapshot(env.db, walkId)?.tempC).toBe(9);
    expect(env.db.all('SELECT 1 FROM weather_snapshot', [])).toHaveLength(1);
  });

  it('reads a snapshot saved before lastRainAt existed', () => {
    const old: Record<string, unknown> = { ...facts() };
    delete old['lastRainAt'];
    env.db.run('INSERT INTO weather_snapshot (walk_id, fetched_at, facts_json) VALUES (?, ?, ?)', [
      walkId,
      'x',
      JSON.stringify(old),
    ]);
    expect(getWeatherSnapshot(env.db, walkId)?.lastRainAt).toBeNull();
  });

  it('returns null when nothing is saved, the JSON is missing, broken or foreign', () => {
    expect(getWeatherSnapshot(env.db, walkId)).toBeNull();
    for (const json of [null, '{broken', '[1]', '"x"', '{"a":1}']) {
      env.db.run('DELETE FROM weather_snapshot', []);
      env.db.run(
        'INSERT INTO weather_snapshot (walk_id, fetched_at, facts_json) VALUES (?, ?, ?)',
        [walkId, 'x', json],
      );
      expect(getWeatherSnapshot(env.db, walkId), String(json)).toBeNull();
    }
  });
});
