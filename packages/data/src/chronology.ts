import {
  baseArrival,
  buildChronology,
  chronologyTitle,
  placeContaining,
  startSpotArrival,
  forgottenBaseStay,
  filterTrack,
  findRides,
  haversineDistanceM,
  type BaseArrival,
  type BaseArrivalOptions,
  type StartSpotOptions,
  type ChronoPlace,
  type ChronoStep,
} from '@pawquest/core';

import type { Ctx } from './ids';
import { isBasePlace, listPlaces } from './places';
import { staysOfWalk } from './placeSuggest';
import { finishWalk, lastTrackPoint, listTrackPoints } from './recorder';
import type { SqlDb } from './sql';
import { getWalk, type Walk } from './walks';
import { listIndoor } from './walkStructure';

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
    boundary: p.boundary ?? undefined,
  }));
  const steps = buildChronology(
    points,
    staysOfWalk(db, walkId, now),
    known,
    { startedAt: walk.startedAt, endedAt: walk.endedAt ?? now },
    { rides: findRides(points), indoor: listIndoor(db, walkId) },
  );
  const placeNames = new Map(places.map((p) => [p.id, p.name]));
  const first = points[0];
  const last = points[points.length - 1];
  const title = chronologyTitle(steps, (id) => placeNames.get(id), {
    startPlaceId: first === undefined ? null : (placeContaining(first, known)?.id ?? null),
    endPlaceId: last === undefined ? null : (placeContaining(last, known)?.id ?? null),
  });
  return { steps, title, placeNames };
}

export interface WalkBaseArrival extends BaseArrival {
  readonly placeName: string;
}

/**
 * Whether a running walk now stands in a base (home, guests) long enough to ask "Finish the
 * walk?" (D-62, 5.1): the base, when the owner arrived there and how long they have been there.
 */
export function walkBaseArrival(
  db: SqlDb,
  walkId: string,
  now: number,
  options: BaseArrivalOptions = {},
): WalkBaseArrival | null {
  const chronology = walkChronology(db, walkId, now);
  const last = lastTrackPoint(db, walkId);
  if (chronology === null || last === null) {
    return null;
  }
  const places = listPlaces(db);
  const bases = new Set(places.filter((p) => isBasePlace(p.category)).map((p) => p.id));
  const found = baseArrival(chronology.steps, bases, last.ts, options);
  return found === null
    ? null
    : { ...found, placeName: chronology.placeNames.get(found.placeId) ?? '' };
}

/**
 * "You are back where you started": for an owner with no home marked, the running walk stands
 * where it began after going away (see `startSpotArrival`). `placeName` is empty and `lat`/`lon`
 * is the spot, so the app can offer to mark it as "Дом".
 */
export function walkStartSpotArrival(
  db: SqlDb,
  walkId: string,
  now: number,
  options: StartSpotOptions = {},
): (WalkBaseArrival & { readonly lat: number; readonly lon: number }) | null {
  const chronology = walkChronology(db, walkId, now);
  const last = lastTrackPoint(db, walkId);
  const track = listTrackPoints(db, walkId);
  const start = track[0];
  if (chronology === null || last === null || start === undefined) {
    return null;
  }
  const farthestM = Math.max(...track.map((p) => haversineDistanceM(start, p)));
  const found = startSpotArrival(chronology.steps, start, farthestM, last.ts, options);
  return found === null
    ? null
    : { ...found, placeName: '', lat: found.visit.lat, lon: found.visit.lon };
}

export type WalkCutSuggestion =
  | {
      readonly kind: 'trim';
      /** The walk should have ended here: the moment the owner came to the base. */
      readonly at: number;
      readonly placeName: string;
      readonly stayS: number;
    }
  | {
      readonly kind: 'split';
      readonly arrivedAt: number;
      readonly leftAt: number;
      readonly placeName: string;
      readonly stayS: number;
    };

/** After the stay the walk must go on for at least this long to be worth a walk of its own. */
const MIN_REST_MS = 5 * 60_000;

/**
 * For a finished walk that was not ended at a base (D-62, 5.1 item 5; S-11): cut the end off when
 * the stay in the base is what remains, split the walk in two when it went on afterwards.
 */
export function walkCutSuggestion(
  db: SqlDb,
  walkId: string,
  now: number,
): WalkCutSuggestion | null {
  const walk = getWalk(db, walkId);
  const chronology = walkChronology(db, walkId, now);
  if (walk?.endedAt == null || chronology === null) {
    return null;
  }
  const places = listPlaces(db);
  const bases = new Set(places.filter((p) => isBasePlace(p.category)).map((p) => p.id));
  const stay = forgottenBaseStay(chronology.steps, bases);
  if (stay === null) {
    return null;
  }
  const placeName = chronology.placeNames.get(stay.placeId) ?? '';
  const { visit } = stay;
  if (stay.isLast || walk.endedAt - visit.toTs < MIN_REST_MS) {
    return { kind: 'trim', at: visit.fromTs, placeName, stayS: visit.durationS };
  }
  return {
    kind: 'split',
    arrivedAt: visit.fromTs,
    leftAt: visit.toTs,
    placeName,
    stayS: visit.durationS,
  };
}

/** Standing in a base this long, after coming from somewhere, ends the walk by itself (5 min). */
export const AUTO_FINISH_STAY_S = 300;

/**
 * The walk ends by itself when the owner came home and stayed there (the owner forgets to press
 * "finish" and walks around the flat): a running GPS walk that now stands in a base for
 * `AUTO_FINISH_STAY_S` is finished at the moment of arrival, so the time spent at home is not
 * part of it. Returns what was done, or null when nothing was.
 */
export function autoFinishAtBase(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  now: number,
): { readonly walk: Walk; readonly placeName: string; readonly arrivedAt: number } | null {
  const walk = getWalk(db, walkId);
  if (walk?.mode !== 'gps' || walk.status !== 'active') {
    return null;
  }
  const arrival = walkBaseArrival(db, walkId, now, { minStayS: AUTO_FINISH_STAY_S });
  if (arrival === null) {
    return null;
  }
  const done = finishWalk(db, ctx, walkId, arrival.arrivedAt);
  return { walk: done, placeName: arrival.placeName, arrivedAt: arrival.arrivedAt };
}
