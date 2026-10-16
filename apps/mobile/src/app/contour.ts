import { overpassQuery, parseOverpassAreas, type LatLon, type MapArea } from '@pawquest/core';

/** Public Overpass servers of OpenStreetMap, tried in turn: any of them may be busy (G-13). */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TIMEOUT_MS = 25_000;
const MAX_CANDIDATES = 6;

async function ask(endpoint: string, query: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Overpass answered ${String(response.status)}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The parks, woods and gardens around a position from the OpenStreetMap map (spike S8): the ones
 * that contain it first, the smallest leading. `null` when no server could be reached (the owner
 * is told quietly and may draw the outline by hand), an empty list when the map knows nothing here.
 */
export async function fetchMapAreas(at: LatLon): Promise<MapArea[] | null> {
  const query = overpassQuery(at);
  for (const endpoint of ENDPOINTS) {
    try {
      return parseOverpassAreas(await ask(endpoint, query), at).slice(0, MAX_CANDIDATES);
    } catch {
      // try the next server
    }
  }
  return null;
}
