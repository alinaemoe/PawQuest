import { describe, expect, it } from 'vitest';

import {
  aqiLevel,
  comfort,
  groundState,
  pollenLevel,
  skyKind,
  surfaceHeat,
  topPollen,
} from './derive';
import air from './fixtures/air.json';
import forecast from './fixtures/forecast.json';
import { airUrl, forecastUrl, parseWeather } from './openMeteo';
import type { WeatherFacts } from './types';

const HOME = { lat: 55.7558, lon: 37.6173 };
const NOW = forecast.current.time * 1000; // the moment the fixture was downloaded

describe('request URLs', () => {
  it('ask for the exact position with 4 decimals and unix time', () => {
    const url = forecastUrl(HOME);
    expect(url).toContain('latitude=55.7558&longitude=37.6173');
    expect(url).toContain('timeformat=unixtime');
    expect(url).toContain('past_days=3');
    expect(url).toContain('minutely_15=precipitation');
    expect(url).toContain('wind_speed_unit=ms');
  });

  it('the air request carries pollen species and rounds the position', () => {
    const url = airUrl({ lat: 55.755_849, lon: 37.617_251 });
    expect(url).toContain('latitude=55.7558&longitude=37.6173');
    expect(url).toContain('birch_pollen');
    expect(url).toContain('european_aqi');
  });
});

describe('parseWeather on a real Open-Meteo response', () => {
  const facts = parseWeather(forecast, air, HOME, NOW);

  it('reads the current values', () => {
    expect(facts).not.toBeNull();
    expect(facts?.tempC).toBe(forecast.current.temperature_2m);
    expect(facts?.apparentC).toBe(forecast.current.apparent_temperature);
    expect(facts?.windMs).toBe(forecast.current.wind_speed_10m);
    expect(facts?.isDay).toBe(forecast.current.is_day === 1);
    expect(facts?.at).toBe(NOW);
  });

  it('says how far the model point is from the requested position', () => {
    // 0.0259 deg of latitude is 2.9 km, 0.0465 deg of longitude at 55.8 N is 2.9 km: 4.1 km in total
    expect(facts?.gridDistanceKm).toBe(4.1);
  });

  it('sums recent rain over completed hours, matching a manual sum of the same series', () => {
    const times = forecast.hourly.time;
    const rain = forecast.hourly.precipitation;
    const nowS = NOW / 1000;
    const manual = (hours: number): number =>
      Math.round(
        times.reduce(
          (sum, t, i) =>
            t + 3600 <= nowS && t + 3600 > nowS - hours * 3600 ? sum + (rain[i] ?? 0) : sum,
          0,
        ) * 100,
      ) / 100;
    expect(facts?.rain24hMm).toBe(manual(24));
    expect(facts?.rain3hMm).toBe(manual(3));
    expect(facts?.rain72hMm).toBe(manual(72));
    expect(facts?.rain72hMm ?? 0).toBeGreaterThanOrEqual(facts?.rain24hMm ?? 0);
    expect(facts?.rain24hMm ?? 0).toBeGreaterThanOrEqual(facts?.rain3hMm ?? 0);
  });

  it('takes surface temperature, moisture and UV from the current hour', () => {
    const i = forecast.hourly.time.findIndex((t) => t <= NOW / 1000 && NOW / 1000 < t + 3600);
    expect(facts?.surfaceTempC).toBe(forecast.hourly.soil_temperature_0cm[i]);
    expect(facts?.soilMoisture).toBe(forecast.hourly.soil_moisture_0_to_1cm[i]);
    expect(facts?.uv).toBe(forecast.hourly.uv_index[i]);
  });

  it('knows the daylight of today and that it is night in the fixture moment', () => {
    expect(facts?.sunrise).not.toBeNull();
    expect(facts?.sunset).not.toBeNull();
    expect(facts?.daylightLeftMin).toBeNull(); // 00:00 local
    expect(facts?.untilSunriseMin).toBeGreaterThan(300);
  });

  it('reads air quality and pollen from the second response', () => {
    expect(facts?.aqi).toBe(air.current.european_aqi);
    expect(facts?.pm25).toBe(air.current.pm2_5);
    expect(facts?.pollen).toEqual([]); // all zero in October
  });
});

describe('parseWeather on odd input', () => {
  it('returns null without usable current values and never throws', () => {
    for (const [index, input] of [
      null,
      undefined,
      5,
      'x',
      [],
      {},
      { current: {} },
      { current: { temperature_2m: 'warm' } },
    ].entries()) {
      expect(parseWeather(input, null, HOME, NOW), `case ${String(index)}`).toBeNull();
    }
  });

  it('works without the air response and with partial hourly data', () => {
    const minimal = { current: { temperature_2m: 12, is_day: 1 } };
    const facts = parseWeather(minimal, null, HOME, NOW);
    expect(facts).toMatchObject({
      tempC: 12,
      apparentC: 12,
      isDay: true,
      rain24hMm: 0,
      surfaceTempC: null,
      aqi: null,
      pollen: [],
      daylightLeftMin: null,
      gridDistanceKm: 0,
    });
  });

  it('daylight left and the nowcast, from hand-made series', () => {
    const nowS = 1_000_000;
    const data = {
      latitude: 55.7558,
      longitude: 37.6173,
      current: { temperature_2m: 5, precipitation: 0, is_day: 1 },
      minutely_15: { time: [nowS - 300, nowS + 600, nowS + 1500], precipitation: [0, 0.4, 0] },
      daily: { time: [nowS - 40_000], sunrise: [nowS - 20_000], sunset: [nowS + 11_400] },
    };
    const facts = parseWeather(data, null, HOME, nowS * 1000);
    expect(facts?.nextRainMin).toBe(10);
    expect(facts?.raining).toBe(false);
    expect(facts?.daylightLeftMin).toBe(190);
    expect(facts?.untilSunriseMin).toBeNull();
  });

  it('raining now from the current value or from the running 15-minute slot', () => {
    const nowS = 1_000_000;
    const base = { current: { temperature_2m: 5 } };
    expect(
      parseWeather({ current: { ...base.current, precipitation: 0.3 } }, null, HOME, nowS * 1000)
        ?.raining,
    ).toBe(true);
    const slot = { ...base, minutely_15: { time: [nowS - 100], precipitation: [0.5] } };
    expect(parseWeather(slot, null, HOME, nowS * 1000)?.raining).toBe(true);
    expect(parseWeather(slot, null, HOME, nowS * 1000)?.nextRainMin).toBeNull();
  });

  it('keeps only pollen species that are in the air', () => {
    const facts = parseWeather(
      { current: { temperature_2m: 15 } },
      { current: { european_aqi: 30, birch_pollen: 12, grass_pollen: 0, alder_pollen: 3 } },
      HOME,
      NOW,
    );
    expect(facts?.pollen).toEqual([
      { species: 'birch', grains: 12 },
      { species: 'alder', grains: 3 },
    ]);
  });
});

const facts = (extra: Partial<WeatherFacts> = {}): WeatherFacts => ({
  at: NOW,
  gridDistanceKm: 1,
  tempC: 12,
  apparentC: 11,
  humidityPct: 60,
  windMs: 2,
  gustMs: 4,
  code: 3,
  isDay: true,
  rain3hMm: 0,
  rain24hMm: 0,
  rain72hMm: 0,
  snow24hCm: 0,
  raining: false,
  nextRainMin: null,
  surfaceTempC: 12,
  soilMoisture: 0.2,
  uv: 1,
  sunrise: null,
  sunset: null,
  daylightLeftMin: null,
  untilSunriseMin: null,
  aqi: 25,
  pm25: 5,
  pollen: [],
  ...extra,
});

describe('groundState (documented thresholds)', () => {
  it('dry without recent rain', () => {
    expect(groundState(facts())).toBe('dry');
  });
  it('wet when it is raining, rained in the last 3 hours, or 3 mm in a day', () => {
    expect(groundState(facts({ raining: true }))).toBe('wet');
    expect(groundState(facts({ rain3hMm: 0.3 }))).toBe('wet');
    expect(groundState(facts({ rain3hMm: 0.2 }))).toBe('dry');
    expect(groundState(facts({ rain24hMm: 3 }))).toBe('wet');
  });
  it('damp for light rain a day ago, a wet three days, or moist soil after some rain', () => {
    expect(groundState(facts({ rain24hMm: 0.5 }))).toBe('damp');
    expect(groundState(facts({ rain72hMm: 4 }))).toBe('damp');
    expect(groundState(facts({ rain72hMm: 1, soilMoisture: 0.45 }))).toBe('damp');
    expect(groundState(facts({ rain72hMm: 1, soilMoisture: 0.2 }))).toBe('dry');
    expect(groundState(facts({ rain72hMm: 3.9 }))).toBe('dry');
  });
  it('snow and possible ice come first', () => {
    expect(groundState(facts({ snow24hCm: 0.5, tempC: 2 }))).toBe('snow');
    expect(groundState(facts({ snow24hCm: 0.5, tempC: 3 }))).toBe('dry');
    expect(groundState(facts({ tempC: 0.5, rain24hMm: 0.2 }))).toBe('icy');
    expect(groundState(facts({ tempC: -3, raining: true }))).toBe('icy');
    expect(groundState(facts({ tempC: -3 }))).toBe('dry');
  });
});

describe('surfaceHeat', () => {
  it('warm from 35 and hot from 45 by the surface value', () => {
    expect(surfaceHeat(facts({ surfaceTempC: 34.9 }))).toBe('ok');
    expect(surfaceHeat(facts({ surfaceTempC: 35 }))).toBe('warm');
    expect(surfaceHeat(facts({ surfaceTempC: 44.9 }))).toBe('warm');
    expect(surfaceHeat(facts({ surfaceTempC: 45 }))).toBe('hot');
  });
  it('without a surface value the daytime air temperature stands in', () => {
    expect(surfaceHeat(facts({ surfaceTempC: null, tempC: 30 }))).toBe('warm');
    expect(surfaceHeat(facts({ surfaceTempC: null, tempC: 30, isDay: false }))).toBe('ok');
    expect(surfaceHeat(facts({ surfaceTempC: null, tempC: 20 }))).toBe('ok');
  });
});

describe('comfort, air, pollen, sky', () => {
  it('comfort extremes use the feels-like temperature', () => {
    expect(comfort(facts({ apparentC: -10 }))).toBe('cold');
    expect(comfort(facts({ apparentC: -9.9 }))).toBe('ok');
    expect(comfort(facts({ apparentC: 28 }))).toBe('heat');
    expect(comfort(facts({ apparentC: 27.9 }))).toBe('ok');
  });
  it('European AQI bands', () => {
    const bands: [number, string][] = [
      [0, 'good'],
      [20, 'good'],
      [21, 'fair'],
      [40, 'fair'],
      [60, 'moderate'],
      [80, 'poor'],
      [100, 'very_poor'],
      [101, 'extreme'],
    ];
    for (const [aqi, level] of bands) {
      expect(aqiLevel(aqi), String(aqi)).toBe(level);
    }
    expect(aqiLevel(null)).toBeNull();
  });
  it('pollen levels and the strongest species', () => {
    expect(pollenLevel(0)).toBe('none');
    expect(pollenLevel(9.9)).toBe('low');
    expect(pollenLevel(10)).toBe('moderate');
    expect(pollenLevel(50)).toBe('high');
    expect(topPollen(facts())).toBeNull();
    expect(
      topPollen(
        facts({
          pollen: [
            { species: 'alder', grains: 3 },
            { species: 'birch', grains: 60 },
          ],
        }),
      ),
    ).toEqual({ species: 'birch', level: 'high', grains: 60 });
  });
  it('maps WMO codes to a coarse sky', () => {
    const cases: [number | null, string | null][] = [
      [0, 'clear'],
      [1, 'clear'],
      [3, 'cloudy'],
      [45, 'fog'],
      [53, 'drizzle'],
      [63, 'rain'],
      [73, 'snow'],
      [81, 'showers'],
      [86, 'snow'],
      [95, 'thunder'],
      [null, null],
    ];
    for (const [code, kind] of cases) {
      expect(skyKind(code), String(code)).toBe(kind);
    }
  });
});
