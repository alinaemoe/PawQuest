import { haversineDistanceM } from '@pawquest/core';
import {
  airUrl,
  forecastUrl,
  parseWeather,
  type Coords,
  type WeatherFacts,
} from '@pawquest/weather';
import * as Location from 'expo-location';

const TIMEOUT_MS = 10_000;
/** Fresh enough to reuse: the rain history does not change in half an hour. */
export const CACHE_MS = 30 * 60_000;
/** A move of this size means the weather may differ; closer than that, the grid point is the same. */
const CACHE_RADIUS_M = 1000;

interface Cached {
  readonly at: Coords;
  readonly facts: WeatherFacts;
}
let cached: Cached | null = null;

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    // the service answers {"error":true,"reason":"…overloaded"} with a normal status sometimes
    return typeof json === 'object' && json !== null && 'error' in json ? null : json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getWithRetry(url: string): Promise<unknown> {
  const first = await getJson(url);
  return first ?? (await getJson(url));
}

/**
 * Weather for an exact position. Fails quietly (null) without a network or when the service is
 * busy (G-13); air quality is optional and never blocks the rest. Reuses a recent answer for the
 * same spot.
 */
export async function loadWeather(
  at: Coords,
  now: number,
  force = false,
): Promise<WeatherFacts | null> {
  if (
    !force &&
    cached !== null &&
    now - cached.facts.at < CACHE_MS &&
    haversineDistanceM(cached.at, at) < CACHE_RADIUS_M
  ) {
    return cached.facts;
  }
  const [forecast, air] = await Promise.all([getWithRetry(forecastUrl(at)), getJson(airUrl(at))]);
  const facts = parseWeather(forecast, air, at, now);
  if (facts !== null) {
    cached = { at, facts };
  }
  return facts ?? cached?.facts ?? null;
}

export type PlaceResult =
  | { readonly kind: 'ok'; readonly at: Coords }
  | { readonly kind: 'no-permission' }
  | { readonly kind: 'unknown' };

/** Where the dog is now: the last known fix if it is recent, else a quick balanced one. */
export async function currentPlace(): Promise<PlaceResult> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { kind: 'no-permission' };
    }
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60 * 60_000 });
    const position =
      last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { kind: 'ok', at: { lat: position.coords.latitude, lon: position.coords.longitude } };
  } catch {
    return { kind: 'unknown' };
  }
}

/** Asks for foreground location (the weather and the map need it); true when granted. */
export async function askForPlace(): Promise<boolean> {
  const result = await Location.requestForegroundPermissionsAsync();
  return result.status === Location.PermissionStatus.GRANTED;
}
