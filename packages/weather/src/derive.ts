import type {
  AqiLevel,
  Comfort,
  GroundState,
  PollenLevel,
  Puddles,
  RainAmount,
  SkyKind,
  SurfaceHeat,
  WeatherFacts,
} from './types';

/**
 * Wet or dry ground, from recent rain and the model's soil moisture. The thresholds are plain and
 * written down so the wording can be checked against them:
 * - snow: 0.5 cm or more fell in 24 h and it is at most 2 degrees;
 * - icy: at most 0.5 degrees with rain in the last 24 h or raining now (possible ice, not certain);
 * - wet: raining now, 0.3 mm in the last 3 h, or 3 mm in 24 h;
 * - damp: 0.5 mm in 24 h, or 4 mm in 72 h, or moist soil with 1 mm in 72 h;
 * - dry otherwise.
 */
export function groundState(f: WeatherFacts): GroundState {
  if (f.snow24hCm >= 0.5 && f.tempC <= 2) {
    return 'snow';
  }
  if (f.tempC <= 0.5 && (f.rain24hMm >= 0.2 || f.raining)) {
    return 'icy';
  }
  if (f.raining || f.rain3hMm >= 0.3 || f.rain24hMm >= 3) {
    return 'wet';
  }
  const moist = f.soilMoisture !== null && f.soilMoisture >= 0.4;
  if (f.rain24hMm >= 0.5 || f.rain72hMm >= 4 || (moist && f.rain72hMm >= 1)) {
    return 'damp';
  }
  return 'dry';
}

/**
 * How hot the ground may be for paws, from the model's surface temperature (0 cm). Asphalt in full
 * sun is hotter than this value, which is why the labels start early: warm from 35, hot from 45.
 * Without a surface value the air temperature stands in (warm from 30 by day).
 */
export function surfaceHeat(f: WeatherFacts): SurfaceHeat {
  if (f.surfaceTempC !== null) {
    return f.surfaceTempC >= 45 ? 'hot' : f.surfaceTempC >= 35 ? 'warm' : 'ok';
  }
  return f.isDay && f.tempC >= 30 ? 'warm' : 'ok';
}

/**
 * How much rain fell over a period, in words a person can picture: under 0.5 mm nothing worth
 * noting, under 1 a sprinkle, under 3 a light rain, under 8 a proper rain, from 8 a downpour.
 */
export function rainAmount(mm: number): RainAmount {
  if (mm < 0.5) {
    return 'none';
  }
  return mm < 1 ? 'sprinkle' : mm < 3 ? 'light' : mm < 8 ? 'proper' : 'downpour';
}

/** Puddles from 3 mm in a day or 1 mm in the last 3 hours; mud from 8 mm in a day. Wet ground only. */
export function puddles(f: WeatherFacts): Puddles {
  if (groundState(f) !== 'wet') {
    return 'none';
  }
  if (f.rain24hMm >= 8) {
    return 'mud';
  }
  return f.rain24hMm >= 3 || f.rain3hMm >= 1 ? 'puddles' : 'none';
}

/** Feels-like extremes for a small dog: cold at -10 or below, heat at 28 or above. */
export function comfort(f: WeatherFacts): Comfort {
  return f.apparentC <= -10 ? 'cold' : f.apparentC >= 28 ? 'heat' : 'ok';
}

/** European Air Quality Index bands. */
export function aqiLevel(aqi: number | null): AqiLevel | null {
  if (aqi === null) {
    return null;
  }
  if (aqi <= 20) {
    return 'good';
  }
  if (aqi <= 40) {
    return 'fair';
  }
  if (aqi <= 60) {
    return 'moderate';
  }
  if (aqi <= 80) {
    return 'poor';
  }
  return aqi <= 100 ? 'very_poor' : 'extreme';
}

/** Pollen in grains per cubic meter: low below 10, moderate below 50, high from 50. */
export function pollenLevel(grains: number): PollenLevel {
  if (grains <= 0) {
    return 'none';
  }
  return grains < 10 ? 'low' : grains < 50 ? 'moderate' : 'high';
}

/** The strongest pollen of the moment, null when there is none. */
export function topPollen(
  f: WeatherFacts,
): { readonly species: string; readonly level: PollenLevel; readonly grains: number } | null {
  const top = [...f.pollen].sort((a, b) => b.grains - a.grains)[0];
  return top === undefined
    ? null
    : { species: top.species, level: pollenLevel(top.grains), grains: top.grains };
}

/** WMO weather code to a coarse sky kind. */
export function skyKind(code: number | null): SkyKind | null {
  if (code === null) {
    return null;
  }
  if (code >= 95) {
    return 'thunder';
  }
  if (code >= 85) {
    return 'snow';
  }
  if (code >= 80) {
    return 'showers';
  }
  if (code >= 71) {
    return 'snow';
  }
  if (code >= 61) {
    return 'rain';
  }
  if (code >= 51) {
    return 'drizzle';
  }
  if (code >= 45) {
    return 'fog';
  }
  return code <= 1 ? 'clear' : 'cloudy';
}
