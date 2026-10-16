import { describe, expect, it } from 'vitest';

import { WEATHER_DIMENSIONS_VERSION, weatherDimensions } from './dimensions';
import type { WeatherFacts } from './types';

const AT = Date.UTC(2026, 9, 16, 8, 0, 0);
const HOUR = 3_600_000;

const facts = (extra: Partial<WeatherFacts> = {}): WeatherFacts => ({
  at: AT,
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

describe('weatherDimensions', () => {
  it('a plain dry autumn morning', () => {
    expect(weatherDimensions(facts())).toEqual({
      ground: 'dry',
      rain_recency: 'over_3d',
      temp: '0_10',
      wind: 'moderate',
      light: 'day',
      air: 'good',
      pollen: undefined,
      paw_heat: 'ok',
    });
  });

  it('the ground follows the documented thresholds of groundState', () => {
    expect(weatherDimensions(facts({ raining: true })).ground).toBe('wet');
    expect(weatherDimensions(facts({ rain72hMm: 4 })).ground).toBe('damp');
    expect(weatherDimensions(facts({ snow24hCm: 1, tempC: -1 })).ground).toBe('snow');
  });

  it('how long ago it rained, at the edges of the bands', () => {
    const at = (hours: number) => weatherDimensions(facts({ lastRainAt: AT - hours * HOUR }));
    expect(weatherDimensions(facts({ raining: true })).rain_recency).toBe('now');
    expect(at(3).rain_recency).toBe('within_3h');
    expect(at(3.01).rain_recency).toBe('within_day');
    expect(at(24).rain_recency).toBe('within_day');
    expect(at(24.5).rain_recency).toBe('within_3d');
    expect(at(72).rain_recency).toBe('within_3d');
    expect(at(73).rain_recency).toBe('over_3d');
  });

  it('temperature bands: each lower edge belongs to the warmer band', () => {
    const t = (c: number) => weatherDimensions(facts({ tempC: c })).temp;
    expect([
      t(-10.1),
      t(-10),
      t(-0.1),
      t(0),
      t(9.9),
      t(10),
      t(19.9),
      t(20),
      t(24.9),
      t(25),
    ]).toEqual([
      'below_-10',
      '-10_0',
      '-10_0',
      '0_10',
      '0_10',
      '10_20',
      '10_20',
      '20_25',
      '20_25',
      'over_25',
    ]);
  });

  it('wind: gusts count, no reading gives no value', () => {
    const w = (wind: number | null, gust: number | null) =>
      weatherDimensions(facts({ windMs: wind, gustMs: gust })).wind;
    expect(w(1, 2)).toBe('calm');
    expect(w(1, 3)).toBe('moderate');
    expect(w(2, 7.9)).toBe('moderate');
    expect(w(2, 8)).toBe('strong');
    expect(w(null, 9)).toBe('strong');
    expect(w(null, null)).toBeUndefined();
  });

  it('light: day, twilight in the last half hour of day and before dawn, dark', () => {
    const l = (extra: Partial<WeatherFacts>) => weatherDimensions(facts(extra)).light;
    expect(l({ isDay: true, daylightLeftMin: 31 })).toBe('day');
    expect(l({ isDay: true, daylightLeftMin: 30 })).toBe('twilight');
    expect(l({ isDay: true, daylightLeftMin: null })).toBe('day');
    expect(l({ isDay: false, daylightLeftMin: null, untilSunriseMin: 20 })).toBe('twilight');
    expect(l({ isDay: false, daylightLeftMin: null, untilSunriseMin: 90 })).toBe('dark');
    expect(l({ isDay: false, daylightLeftMin: null, untilSunriseMin: null })).toBe('dark');
  });

  it('air: the European bands in three words', () => {
    const a = (aqi: number | null) => weatherDimensions(facts({ aqi })).air;
    expect([a(20), a(40), a(41), a(60), a(61), a(150)]).toEqual([
      'good',
      'good',
      'moderate',
      'moderate',
      'poor',
      'poor',
    ]);
    expect(a(null)).toBeUndefined();
  });

  it('pollen: low or high by the strongest species; no data, no value', () => {
    const p = (grains: number[]) =>
      weatherDimensions(
        facts({ pollen: grains.map((g, i) => ({ species: `s${String(i)}`, grains: g })) }),
      ).pollen;
    expect(p([])).toBeUndefined();
    expect(p([0, 5])).toBe('low');
    expect(p([9, 5])).toBe('low');
    expect(p([10, 2])).toBe('high'); // moderate pollen and up is "high" here
    expect(p([30, 2])).toBe('high');
  });

  it('paw heat follows the surface temperature', () => {
    expect(weatherDimensions(facts({ surfaceTempC: 36 })).paw_heat).toBe('warm');
    expect(weatherDimensions(facts({ surfaceTempC: 46 })).paw_heat).toBe('hot');
  });

  it('the version is an integer that has to move with the bands', () => {
    expect(Number.isInteger(WEATHER_DIMENSIONS_VERSION)).toBe(true);
  });
});
