import { haversineDistanceM, type LatLon } from '../geo/haversine';
import { distanceToRingM, pointInRing, ringAreaM2 } from '../geo/polygon';

import type { TimedPoint } from './motion';
import type { Ride } from './rides';
import type { Stay, StayScaleName } from './stays';

/**
 * The chronology of a walk (D-62, section 5.3): what the walk consisted of, in order: the
 * visits (stays: time inside one area, a saved place or an unnamed one) and the legs between
 * them. It is derived, never stored as truth: the same track and places always give the same result.
 */

export interface ChronoPlace extends LatLon {
  readonly id: string;
  readonly name: string;
  readonly radiusM: number;
  /** The contour of the place, when it has one: then it is the contour that counts, not the radius. */
  readonly boundary?: readonly LatLon[] | undefined;
}

export interface ChronoVisit extends LatLon {
  readonly kind: 'visit';
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  readonly radiusM: number;
  /** The saved place the visit is in, or null for an unnamed area. */
  readonly placeId: string | null;
  readonly scale: StayScaleName;
  /** Time without GPS inside the visit (a shop, a lift). */
  readonly gapS: number;
  /** Smaller stays inside this visit (a stand at the clearing during a walk through the park). */
  readonly innerCount: number;
  /** The owner marked this time as spent indoors without the dog. */
  readonly indoor: boolean;
}

export interface ChronoLeg {
  readonly kind: 'leg';
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  readonly lengthM: number;
}

/** A stretch in a car, a taxi or on a bike: part of the record, not of the walking. */
export interface ChronoRide {
  readonly kind: 'ride';
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  readonly lengthM: number;
}

export type ChronoStep = ChronoVisit | ChronoLeg | ChronoRide;

export interface ChronologyOptions {
  /** A leg shorter than this is not shown: the neighbouring visits simply follow each other. Default 60 s. */
  readonly minLegS?: number;
  /** A saved place is "here" when the visit centre is within its radius, at least this far. Default 40 m. */
  readonly minPlaceReachM?: number;
  /** A visit shorter than this once cut to the walk is dropped. Default 180 s (the smallest stay). */
  readonly minVisitS?: number;
  /** Rides found in the track: the legs are split around them. */
  readonly rides?: readonly Ride[];
  /** Stretches the owner marked as spent indoors without the dog. */
  readonly indoor?: readonly { readonly fromTs: number; readonly toTs: number }[];
}

/** A contour counts a few meters past its edge: GPS wobbles at the fence of a park. */
const CONTOUR_EDGE_M = 15;

/**
 * The saved place that contains a position: inside its contour when it has one (a few meters past
 * the edge counts), else inside its radius (but not less than the reach). When places lie inside
 * each other the smallest wins, "the glade" rather than "the park"; equal ones go to the nearest.
 */
export function placeContaining(
  at: LatLon,
  places: readonly ChronoPlace[],
  minReachM = 40,
): ChronoPlace | null {
  let best: { place: ChronoPlace; area: number; distance: number } | null = null;
  for (const place of places) {
    const distance = haversineDistanceM(at, place);
    let area: number;
    if (place.boundary !== undefined && place.boundary.length >= 3) {
      if (
        !pointInRing(at, place.boundary) &&
        distanceToRingM(at, place.boundary) > CONTOUR_EDGE_M
      ) {
        continue;
      }
      area = ringAreaM2(place.boundary);
    } else {
      const reach = Math.max(place.radiusM, minReachM);
      if (distance > reach) {
        continue;
      }
      area = Math.PI * reach * reach;
    }
    if (best === null || area < best.area || (area === best.area && distance < best.distance)) {
      best = { place, area, distance };
    }
  }
  return best?.place ?? null;
}

/** The share of [fromTs, toTs] that lies in the marked indoor stretches. */
function indoorShare(
  spans: readonly { readonly fromTs: number; readonly toTs: number }[],
  fromTs: number,
  toTs: number,
): number {
  let covered = 0;
  for (const span of spans) {
    covered += Math.max(0, Math.min(span.toTs, toTs) - Math.max(span.fromTs, fromTs));
  }
  return toTs > fromTs ? Math.min(1, covered / (toTs - fromTs)) : 0;
}

function pathLengthM(points: readonly TimedPoint[], fromTs: number, toTs: number): number {
  let total = 0;
  let previous: TimedPoint | null = null;
  for (const point of points) {
    if (point.ts < fromTs || point.ts > toTs) {
      continue;
    }
    if (previous !== null) {
      total += haversineDistanceM(previous, point);
    }
    previous = point;
  }
  return total;
}

/**
 * Visits and legs of one walk, in time order. `points` is the filtered track, `stays` its stays
 * (top level, each with its inner ones), `places` the saved places. The walk starts and ends
 * with a leg (when long enough), and every visit is followed by one before the next.
 */
export function buildChronology(
  points: readonly TimedPoint[],
  stays: readonly Stay[],
  places: readonly ChronoPlace[],
  bounds: { readonly startedAt: number; readonly endedAt: number },
  options: ChronologyOptions = {},
): ChronoStep[] {
  const minLegS = options.minLegS ?? 60;
  const reach = options.minPlaceReachM ?? 40;
  const minVisitS = options.minVisitS ?? 180;
  const visits = [...stays].sort((a, b) => a.fromTs - b.fromTs);
  const steps: ChronoStep[] = [];
  const rides = [...(options.rides ?? [])].sort((a, b) => a.fromTs - b.fromTs);
  const walkLeg = (fromTs: number, toTs: number): void => {
    const durationS = (toTs - fromTs) / 1000;
    if (durationS >= minLegS) {
      steps.push({
        kind: 'leg',
        fromTs,
        toTs,
        durationS,
        lengthM: pathLengthM(points, fromTs, toTs),
      });
    }
  };
  // the way between two visits: walking pieces with the rides in them as steps of their own
  const leg = (fromTs: number, toTs: number): void => {
    let at = fromTs;
    for (const ride of rides) {
      const rideFrom = Math.max(ride.fromTs, at);
      const rideTo = Math.min(ride.toTs, toTs);
      if (rideTo - rideFrom < 1000) {
        continue;
      }
      walkLeg(at, rideFrom);
      steps.push({
        kind: 'ride',
        fromTs: rideFrom,
        toTs: rideTo,
        durationS: (rideTo - rideFrom) / 1000,
        lengthM: pathLengthM(points, rideFrom, rideTo),
      });
      at = rideTo;
    }
    walkLeg(at, toTs);
  };
  let cursor = bounds.startedAt;
  for (const stay of visits) {
    // a stale first fix or a late last one may reach outside the walk: the visit is cut to it
    const fromTs = Math.max(stay.fromTs, bounds.startedAt, cursor);
    const toTs = Math.min(stay.toTs, bounds.endedAt);
    const durationS = (toTs - fromTs) / 1000;
    if (durationS < minVisitS) {
      continue;
    }
    leg(cursor, fromTs);
    steps.push({
      kind: 'visit',
      fromTs,
      toTs,
      durationS,
      lat: stay.lat,
      lon: stay.lon,
      radiusM: stay.radiusM,
      placeId: placeContaining(stay, places, reach)?.id ?? null,
      scale: stay.scale,
      gapS: stay.gapS,
      innerCount: stay.inner.length,
      indoor: indoorShare(options.indoor ?? [], fromTs, toTs) >= 0.5,
    });
    cursor = toTs;
  }
  leg(cursor, bounds.endedAt);
  return steps;
}

/** How many visits there were to each saved place (two visits to one clearing are two). */
export function visitsByPlace(steps: readonly ChronoStep[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const step of steps) {
    if (step.kind === 'visit' && step.placeId !== null) {
      counts.set(step.placeId, (counts.get(step.placeId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * "Дом → Магазин → Парк → Дом": the saved place the walk began in, the places of its visits in
 * order and the saved place it ended in. A place repeated in a row is named once; null when no
 * saved place is involved at all.
 */
export function chronologyTitle(
  steps: readonly ChronoStep[],
  nameOf: (placeId: string) => string | undefined,
  ends: { readonly startPlaceId?: string | null; readonly endPlaceId?: string | null } = {},
): string | null {
  const names: string[] = [];
  const add = (placeId: string | null | undefined): void => {
    const name = placeId == null ? undefined : nameOf(placeId);
    if (name !== undefined && names[names.length - 1] !== name) {
      names.push(name);
    }
  };
  add(ends.startPlaceId);
  for (const step of steps) {
    if (step.kind === 'visit') {
      add(step.placeId);
    }
  }
  add(ends.endPlaceId);
  return names.length === 0 ? null : names.join(' → ');
}

export interface BaseArrival {
  readonly visit: ChronoVisit;
  /** The saved place (a base) where the walk now stands. */
  readonly placeId: string;
  /** When the owner arrived there: the walk ends at this moment if they agree. */
  readonly arrivedAt: number;
  readonly stayS: number;
}

export interface BaseArrivalOptions {
  /** A stay in a base this long ends the walk (question). Default 900 s (15 min). */
  readonly minStayS?: number;
  /** The stay counts as "now" when it reaches to within this long of the last fix. Default 180 s. */
  readonly freshS?: number;
}

/**
 * "You came to Mom's. Finish the walk?" (D-62, 5.1 item 1): the walk now stands in a base (home,
 * guests) for at least 15 minutes, and it got there from somewhere (the first step of a walk is
 * not an arrival: standing at one's own door before setting off is not coming home). Shops, vets
 * and groomers are not bases, a short visit ("hand something over") is part of the walk.
 */
export function baseArrival(
  steps: readonly ChronoStep[],
  baseIds: ReadonlySet<string>,
  lastFixTs: number,
  options: BaseArrivalOptions = {},
): BaseArrival | null {
  const minStayS = options.minStayS ?? 900;
  const freshS = options.freshS ?? 180;
  const index = steps.length - 1;
  const last = steps[index];
  if (
    index < 1 ||
    last?.kind !== 'visit' ||
    last.placeId === null ||
    !baseIds.has(last.placeId) ||
    last.durationS < minStayS ||
    (lastFixTs - last.toTs) / 1000 > freshS
  ) {
    return null;
  }
  return { visit: last, placeId: last.placeId, arrivedAt: last.fromTs, stayS: last.durationS };
}

export interface StartSpotOptions extends BaseArrivalOptions {
  /** The stay is "where the walk began" within this distance of the first fix. Default 80 m. */
  readonly radiusM?: number;
  /** The walk must have gone at least this far from the start first. Default 150 m. */
  readonly awayM?: number;
}

/**
 * "You came back to where you started" for an owner who has not marked a home: the walk now
 * stands, for at least `minStayS` (10 minutes by default), within 80 m of its first fix, after it
 * had been at least 150 m away. Walks mostly begin and end at one's door, so this is a good
 * guess of "home"; it only asks, it never decides (the base question works without it).
 */
export function startSpotArrival(
  steps: readonly ChronoStep[],
  start: LatLon,
  farthestM: number,
  lastFixTs: number,
  options: StartSpotOptions = {},
): BaseArrival | null {
  const minStayS = options.minStayS ?? 600;
  const freshS = options.freshS ?? 180;
  const radiusM = options.radiusM ?? 80;
  const awayM = options.awayM ?? 150;
  const index = steps.length - 1;
  const last = steps[index];
  if (
    index < 1 ||
    last?.kind !== 'visit' ||
    farthestM < awayM ||
    haversineDistanceM(last, start) > radiusM ||
    last.durationS < minStayS ||
    (lastFixTs - last.toTs) / 1000 > freshS
  ) {
    return null;
  }
  return {
    visit: last,
    placeId: last.placeId ?? '',
    arrivedAt: last.fromTs,
    stayS: last.durationS,
  };
}

/**
 * The first long stay in a base inside a walk that was not finished there (D-62, 5.1 item 5):
 * the walk went on (or was left running) after the owner came to a base for good. Null when the
 * walk has no such stay. A stay at the very start is not one (the first step of a walk).
 */
export function forgottenBaseStay(
  steps: readonly ChronoStep[],
  baseIds: ReadonlySet<string>,
  minStayS = 900,
): { readonly visit: ChronoVisit; readonly placeId: string; readonly isLast: boolean } | null {
  for (let i = 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (
      step?.kind === 'visit' &&
      step.placeId !== null &&
      baseIds.has(step.placeId) &&
      step.durationS >= minStayS
    ) {
      return { visit: step, placeId: step.placeId, isLast: i === steps.length - 1 };
    }
  }
  return null;
}
