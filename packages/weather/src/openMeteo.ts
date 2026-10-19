import { haversineDistanceM } from '@pawquest/core';

import { surfaceWaterMm, type HourlyWater } from './surfaceWater';
import type { Coords, WeatherFacts } from './types';

const FORECAST_HOST = 'https://api.open-meteo.com/v1/forecast';
const AIR_HOST = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/**
 * Forecast request for an exact position. Open-Meteo answers with its nearest grid point (a few
 * kilometers), so the response is checked for how far that is. Past seven days of hourly data give
 * the recent rain and how fast it dried; the 15-minute series gives the nowcast of the next two hours.
 */
export function forecastUrl(at: Coords): string {
  const params = [
    `latitude=${at.lat.toFixed(4)}`,
    `longitude=${at.lon.toFixed(4)}`,
    'current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    'hourly=precipitation,snowfall,soil_temperature_0cm,soil_moisture_0_to_1cm,uv_index,weather_code,et0_fao_evapotranspiration',
    'minutely_15=precipitation',
    'daily=sunrise,sunset',
    'past_days=7',
    'forecast_days=1',
    'past_minutely_15=8',
    'forecast_minutely_15=8',
    'wind_speed_unit=ms',
    'timeformat=unixtime',
    'timezone=auto',
  ];
  return `${FORECAST_HOST}?${params.join('&')}`;
}

export function airUrl(at: Coords): string {
  const params = [
    `latitude=${at.lat.toFixed(4)}`,
    `longitude=${at.lon.toFixed(4)}`,
    'current=european_aqi,pm2_5,pm10,birch_pollen,grass_pollen,alder_pollen,ragweed_pollen,mugwort_pollen,olive_pollen',
    'timeformat=unixtime',
    'timezone=auto',
  ];
  return `${AIR_HOST}?${params.join('&')}`;
}

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function series(parent: Json | null, key: string): (number | null)[] {
  const value = parent?.[key];
  return Array.isArray(value) ? value.map(num) : [];
}

/** Sum of an hourly series over the completed hours that ended within the last `hours` hours. */
function sumCompletedHours(
  times: readonly (number | null)[],
  values: readonly (number | null)[],
  nowS: number,
  hours: number,
): number {
  let sum = 0;
  times.forEach((start, i) => {
    if (start === null) {
      return;
    }
    const end = start + 3600;
    if (end <= nowS && end > nowS - hours * 3600) {
      sum += values[i] ?? 0;
    }
  });
  return Math.round(sum * 100) / 100;
}

/** End of the latest completed hour with at least 0.1 mm of rain in the last 72 hours, in ms. */
function lastRainEnd(
  times: readonly (number | null)[],
  values: readonly (number | null)[],
  nowS: number,
): number | null {
  let last = 0;
  for (const [i, start] of times.entries()) {
    const end = start === null ? 0 : start + 3600;
    if (end <= nowS && end > nowS - 72 * 3600 && (values[i] ?? 0) >= 0.1) {
      last = Math.max(last, end);
    }
  }
  return last === 0 ? null : last * 1000;
}

/** Index of the hour that contains `nowS`, or -1. */
function currentHourIndex(times: readonly (number | null)[], nowS: number): number {
  let found = -1;
  times.forEach((t, i) => {
    if (t !== null && t <= nowS && nowS < t + 3600) {
      found = i;
    }
  });
  return found;
}

/**
 * Turns the two API responses into {@link WeatherFacts} for `now`. The forecast is required (null
 * without usable current values); the air-quality response is optional. Never throws on odd input.
 */
export function parseWeather(
  forecast: unknown,
  air: unknown,
  requested: Coords,
  now: number,
): WeatherFacts | null {
  const root = obj(forecast);
  const current = obj(root?.['current']);
  const tempC = num(current?.['temperature_2m']);
  if (root === null || current === null || tempC === null) {
    return null;
  }
  const nowS = now / 1000;
  const hourly = obj(root['hourly']);
  const hTimes = series(hourly, 'time');
  const precip = series(hourly, 'precipitation');
  const snow = series(hourly, 'snowfall');
  const et0 = series(hourly, 'et0_fao_evapotranspiration');
  const hour = currentHourIndex(hTimes, nowS);
  // the completed hours of the last week, oldest first: what fell and how much could dry
  const waterHours: HourlyWater[] = hTimes.flatMap((start, i) =>
    start !== null && start + 3600 <= nowS && start + 3600 > nowS - 7 * 24 * 3600
      ? [{ rainMm: precip[i] ?? 0, et0Mm: et0[i] ?? null }]
      : [],
  );

  const m15 = obj(root['minutely_15']);
  const mTimes = series(m15, 'time');
  const mPrecip = series(m15, 'precipitation');
  const currentPrecip = num(current['precipitation']) ?? 0;
  let raining = currentPrecip >= 0.1;
  let nextRainMin: number | null = null;
  mTimes.forEach((start, i) => {
    if (start === null || (mPrecip[i] ?? 0) < 0.1) {
      return;
    }
    if (start <= nowS && nowS < start + 900) {
      raining = true;
    } else if (start > nowS && nextRainMin === null) {
      nextRainMin = Math.ceil((start - nowS) / 60);
    }
  });

  const daily = obj(root['daily']);
  const dTimes = series(daily, 'time');
  const day = dTimes.findIndex((t) => t !== null && t <= nowS && nowS < t + 86_400);
  const sunrise = day < 0 ? null : (series(daily, 'sunrise')[day] ?? null);
  const sunset = day < 0 ? null : (series(daily, 'sunset')[day] ?? null);
  const isDay = num(current['is_day']) === 1;

  const airCurrent = obj(obj(air)?.['current']);
  const pollenKeys = [
    'birch_pollen',
    'grass_pollen',
    'alder_pollen',
    'ragweed_pollen',
    'mugwort_pollen',
    'olive_pollen',
  ] as const;
  const pollen = pollenKeys
    .map((key) => ({ species: key.replace('_pollen', ''), grains: num(airCurrent?.[key]) ?? 0 }))
    .filter((p) => p.grains > 0);

  const lat = num(root['latitude']);
  const lon = num(root['longitude']);
  const gridDistanceKm =
    lat === null || lon === null ? 0 : haversineDistanceM(requested, { lat, lon }) / 1000;

  return {
    at: now,
    gridDistanceKm: Math.round(gridDistanceKm * 10) / 10,
    tempC,
    apparentC: num(current['apparent_temperature']) ?? tempC,
    humidityPct: num(current['relative_humidity_2m']),
    windMs: num(current['wind_speed_10m']),
    gustMs: num(current['wind_gusts_10m']),
    code: num(current['weather_code']),
    isDay,
    rain3hMm: sumCompletedHours(hTimes, precip, nowS, 3),
    rain24hMm: sumCompletedHours(hTimes, precip, nowS, 24),
    rain72hMm: sumCompletedHours(hTimes, precip, nowS, 72),
    snow24hCm: sumCompletedHours(hTimes, snow, nowS, 24),
    raining,
    nextRainMin,
    lastRainAt: raining ? now : lastRainEnd(hTimes, precip, nowS),
    surfaceTempC: hour < 0 ? null : (series(hourly, 'soil_temperature_0cm')[hour] ?? null),
    soilMoisture: hour < 0 ? null : (series(hourly, 'soil_moisture_0_to_1cm')[hour] ?? null),
    surfaceWaterMm: waterHours.length < 24 ? null : surfaceWaterMm(waterHours),
    uv: hour < 0 ? null : (series(hourly, 'uv_index')[hour] ?? null),
    sunrise: sunrise === null ? null : sunrise * 1000,
    sunset: sunset === null ? null : sunset * 1000,
    daylightLeftMin:
      sunrise !== null && sunset !== null && nowS >= sunrise && nowS < sunset
        ? Math.floor((sunset - nowS) / 60)
        : null,
    untilSunriseMin: sunrise !== null && nowS < sunrise ? Math.ceil((sunrise - nowS) / 60) : null,
    aqi: num(airCurrent?.['european_aqi']),
    pm25: num(airCurrent?.['pm2_5']),
    pollen,
  };
}
