export interface Coords {
  readonly lat: number;
  readonly lon: number;
}

export type GroundState = 'dry' | 'damp' | 'wet' | 'snow' | 'icy';
export type SurfaceHeat = 'ok' | 'warm' | 'hot';
export type AqiLevel = 'good' | 'fair' | 'moderate' | 'poor' | 'very_poor' | 'extreme';
export type PollenLevel = 'none' | 'low' | 'moderate' | 'high';
export type Comfort = 'cold' | 'ok' | 'heat';
export type SkyKind =
  'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'showers' | 'thunder';

export interface PollenReading {
  readonly species: string;
  readonly grains: number;
}

/**
 * What the weather is for a dog walk at an exact place and moment. Every number is a measurement
 * or a model value; nothing here is advice (G-19). `null` means the source did not provide it.
 */
export interface WeatherFacts {
  /** The moment the values describe, epoch ms. */
  readonly at: number;
  /** How far the model's grid point is from the requested position, km. */
  readonly gridDistanceKm: number;
  readonly tempC: number;
  readonly apparentC: number;
  readonly humidityPct: number | null;
  readonly windMs: number | null;
  readonly gustMs: number | null;
  readonly code: number | null;
  readonly isDay: boolean;
  /** Rain in the last 3, 24 and 72 completed hours, mm. */
  readonly rain3hMm: number;
  readonly rain24hMm: number;
  readonly rain72hMm: number;
  readonly snow24hCm: number;
  readonly raining: boolean;
  /** Minutes until the next rain in the 15-minute nowcast (next 2 h), null when none expected. */
  readonly nextRainMin: number | null;
  /** Model surface temperature (0 cm) and top-soil moisture (m3/m3). */
  readonly surfaceTempC: number | null;
  readonly soilMoisture: number | null;
  readonly uv: number | null;
  readonly sunrise: number | null;
  readonly sunset: number | null;
  /** Minutes of daylight left today, null when it is dark. */
  readonly daylightLeftMin: number | null;
  /** Minutes until sunrise when it is dark before dawn, otherwise null. */
  readonly untilSunriseMin: number | null;
  readonly aqi: number | null;
  readonly pm25: number | null;
  readonly pollen: readonly PollenReading[];
}
