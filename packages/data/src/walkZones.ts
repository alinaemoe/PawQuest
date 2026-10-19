import { filterTrack, zoneVisits } from '@pawquest/core';

import { listPlaces } from './places';
import { listTrackPoints } from './recorder';
import type { SqlDb } from './sql';

export interface WalkZone {
  readonly placeId: string;
  readonly name: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly dwellS: number;
}

/** The stays of one walk in the saved places, in time order (D-73); empty for a walk with no track. */
export function walkZones(db: SqlDb, walkId: string): WalkZone[] {
  const fixes = filterTrack(listTrackPoints(db, walkId)).points;
  if (fixes.length < 2) {
    return [];
  }
  const places = listPlaces(db);
  const names = new Map(places.map((p) => [p.id, p.name]));
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
  ).map((v) => ({
    placeId: v.placeId,
    name: names.get(v.placeId) ?? '',
    fromTs: v.fromTs,
    toTs: v.toTs,
    dwellS: Math.round(v.dwellS),
  }));
}
