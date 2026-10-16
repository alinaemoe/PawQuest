import {
  baseArrival,
  buildChronology,
  chronologyTitle,
  filterTrack,
  findRides,
  type BaseArrival,
  type ChronoPlace,
  type ChronoStep,
} from '@pawquest/core';

import { isBasePlace, listPlaces } from './places';
import { staysOfWalk } from './placeSuggest';
import { lastTrackPoint, listTrackPoints } from './recorder';
import type { SqlDb } from './sql';
import { getWalk } from './walks';

export interface WalkChronology {
  readonly steps: ChronoStep[];
  /** "Дом → Магазин → Парк" by the saved places visited, or null when none were. */
  readonly title: string | null;
  /** Names of the saved places that appear in the steps. */
  readonly placeNames: ReadonlyMap<string, string>;
}

/**
 * What a GPS walk consisted of: the visits and the legs between them, with the saved places
 * recognised (D-62, 5.3). Derived on every call from the track and the places, so a place that is
 * added or reshaped later changes the result of old walks too. Null for a walk without a track.
 */
export function walkChronology(db: SqlDb, walkId: string, now: number): WalkChronology | null {
  const walk = getWalk(db, walkId);
  if (walk === null) {
    return null;
  }
  const points = filterTrack(listTrackPoints(db, walkId)).points;
  if (points.length < 2) {
    return null;
  }
  const places = listPlaces(db);
  const known: ChronoPlace[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    radiusM: p.radiusM,
  }));
  const steps = buildChronology(
    points,
    staysOfWalk(db, walkId, now),
    known,
    { startedAt: walk.startedAt, endedAt: walk.endedAt ?? now },
    { rides: findRides(points) },
  );
  const placeNames = new Map(places.map((p) => [p.id, p.name]));
  return { steps, title: chronologyTitle(steps, (id) => placeNames.get(id)), placeNames };
}

export interface WalkBaseArrival extends BaseArrival {
  readonly placeName: string;
}

/**
 * Whether a running walk now stands in a base (home, guests) long enough to ask "Finish the
 * walk?" (D-62, 5.1): the base, when the owner arrived there and how long they have been there.
 */
export function walkBaseArrival(db: SqlDb, walkId: string, now: number): WalkBaseArrival | null {
  const chronology = walkChronology(db, walkId, now);
  const last = lastTrackPoint(db, walkId);
  if (chronology === null || last === null) {
    return null;
  }
  const places = listPlaces(db);
  const bases = new Set(places.filter((p) => isBasePlace(p.category)).map((p) => p.id));
  const found = baseArrival(chronology.steps, bases, last.ts);
  return found === null
    ? null
    : { ...found, placeName: chronology.placeNames.get(found.placeId) ?? '' };
}
