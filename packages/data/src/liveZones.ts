import { filterTrack, zoneVisits } from '@pawquest/core';

import { listPlaces } from './places';
import { listTrackPoints } from './recorder';
import type { SqlDb } from './sql';

/** A saved place the running walk is inside of right now (docs/23, step 3.19). */
export interface LiveZone {
  readonly placeId: string;
  readonly name: string;
  readonly notes: string | null;
  /** When the walk came in (the first fix of this stay). */
  readonly sinceTs: number;
}

/** How far back the track is read: a stay older than that shows as beginning at the window. */
const WINDOW_MS = 40 * 60_000;

/**
 * The saved places the running walk is in now, the widest first ("park", then "glade"). Worked out
 * from the last forty minutes of the track by the same rule as the zones of a finished walk, so
 * what the walk says while it runs is what the summary says after. Cheap enough to ask every few
 * seconds: the track is thinned by the GPS filter and only places around are tested.
 */
export function liveZones(db: SqlDb, walkId: string, now: number): LiveZone[] {
  const fixes = filterTrack(listTrackPoints(db, walkId)).points.filter(
    (p) => p.ts >= now - WINDOW_MS,
  );
  const last = fixes[fixes.length - 1];
  if (last === undefined) {
    return [];
  }
  const places = listPlaces(db);
  const known = new Map(places.map((p) => [p.id, p]));
  return zoneVisits(
    fixes.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, accuracyM: p.accuracyM })),
    places.map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      radiusM: p.radiusM,
      boundary: p.boundary ?? undefined,
    })),
  )
    .filter((v) => v.open && v.toTs >= last.ts)
    .sort((a, b) => b.toTs - b.fromTs - (a.toTs - a.fromTs))
    .flatMap((v): LiveZone[] => {
      const place = known.get(v.placeId);
      return place === undefined
        ? []
        : [{ placeId: v.placeId, name: place.name, notes: place.notes, sinceTs: v.fromTs }];
    });
}
