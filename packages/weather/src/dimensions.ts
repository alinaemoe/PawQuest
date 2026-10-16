import { aqiLevel, groundState, pollenLevel, surfaceHeat } from './derive';
import type { WeatherFacts } from './types';

/**
 * The weather of a walk as categories for comparisons (docs/21, A-31). Bands and names are fixed
 * here and in the tests: changing one changes what old walks are compared by, so a change must
 * raise `WEATHER_DIMENSIONS_VERSION`.
 */
export const WEATHER_DIMENSIONS_VERSION = 1;

export interface WeatherDimensions {
  readonly ground: string;
  readonly rain_recency: string;
  readonly temp: string;
  readonly wind: string | undefined;
  readonly light: string;
  readonly air: string | undefined;
  readonly pollen: string | undefined;
  readonly paw_heat: string;
}

const HOUR = 3_600_000;
/** Within this long of sunrise or sunset it is neither day nor night. */
const TWILIGHT_MIN = 30;

function rainRecency(f: WeatherFacts): string {
  if (f.raining) {
    return 'now';
  }
  if (f.lastRainAt === null) {
    return 'over_3d';
  }
  const ago = f.at - f.lastRainAt;
  return ago <= 3 * HOUR
    ? 'within_3h'
    : ago <= 24 * HOUR
      ? 'within_day'
      : ago <= 72 * HOUR
        ? 'within_3d'
        : 'over_3d';
}

function tempBand(c: number): string {
  if (c < -10) {
    return 'below_-10';
  }
  if (c < 0) {
    return '-10_0';
  }
  if (c < 10) {
    return '0_10';
  }
  if (c < 20) {
    return '10_20';
  }
  return c < 25 ? '20_25' : 'over_25';
}

/** The stronger of the wind and its gusts decides: gusts are what a small dog feels. */
function windBand(f: WeatherFacts): string | undefined {
  const speed = Math.max(f.windMs ?? 0, f.gustMs ?? 0);
  if (f.windMs === null && f.gustMs === null) {
    return undefined;
  }
  return speed < 3 ? 'calm' : speed < 8 ? 'moderate' : 'strong';
}

function light(f: WeatherFacts): string {
  if (f.isDay) {
    return f.daylightLeftMin !== null && f.daylightLeftMin <= TWILIGHT_MIN ? 'twilight' : 'day';
  }
  return f.untilSunriseMin !== null && f.untilSunriseMin <= TWILIGHT_MIN ? 'twilight' : 'dark';
}

function air(aqi: number | null): string | undefined {
  const level = aqiLevel(aqi);
  if (level === null) {
    return undefined;
  }
  return level === 'good' || level === 'fair' ? 'good' : level === 'moderate' ? 'moderate' : 'poor';
}

function pollen(f: WeatherFacts): string | undefined {
  if (f.pollen.length === 0) {
    return undefined;
  }
  const top = Math.max(...f.pollen.map((p) => p.grains));
  const level = pollenLevel(top);
  return level === 'none' || level === 'low' ? 'low' : 'high';
}

/**
 * The categories of one weather snapshot: `ground` (dry/damp/wet/snow/icy), `rain_recency`,
 * `temp` band, `wind`, `light`, `air`, `pollen`, `paw_heat`. A missing reading gives no value for
 * that dimension (the walk simply does not take part in that comparison).
 */
export function weatherDimensions(facts: WeatherFacts): WeatherDimensions {
  return {
    ground: groundState(facts),
    rain_recency: rainRecency(facts),
    temp: tempBand(facts.tempC),
    wind: windBand(facts),
    light: light(facts),
    air: air(facts.aqi),
    pollen: pollen(facts),
    paw_heat: surfaceHeat(facts),
  };
}
