import { haversineDistanceM, type LatLon } from '../geo/haversine';

import type { TimedPoint } from './motion';
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
}

export interface ChronoLeg {
  readonly kind: 'leg';
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  readonly lengthM: number;
}

export type ChronoStep = ChronoVisit | ChronoLeg;

export interface ChronologyOptions {
  /** A leg shorter than this is not shown: the neighbouring visits simply follow each other. Default 60 s. */
  readonly minLegS?: number;
  /** A saved place is "here" when the visit centre is within its radius, at least this far. Default 40 m. */
  readonly minPlaceReachM?: number;
  /** A visit shorter than this once cut to the walk is dropped. Default 180 s (the smallest stay). */
  readonly minVisitS?: number;
}

/** The nearest saved place that contains a position (its radius, but not less than the reach). */
export function placeContaining(
  at: LatLon,
  places: readonly ChronoPlace[],
  minReachM = 40,
): ChronoPlace | null {
  let best: { place: ChronoPlace; distance: number } | null = null;
  for (const place of places) {
    const distance = haversineDistanceM(at, place);
    if (
      distance <= Math.max(place.radiusM, minReachM) &&
      (best === null || distance < best.distance)
    ) {
      best = { place, distance };
    }
  }
  return best?.place ?? null;
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
  const leg = (fromTs: number, toTs: number): void => {
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

/** "Магазин → Парк": the saved places of the visits in order, a place repeated in a row once. */
export function chronologyTitle(
  steps: readonly ChronoStep[],
  nameOf: (placeId: string) => string | undefined,
): string | null {
  const names: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'visit' || step.placeId === null) {
      continue;
    }
    const name = nameOf(step.placeId);
    if (name !== undefined && names[names.length - 1] !== name) {
      names.push(name);
    }
  }
  return names.length === 0 ? null : names.join(' → ');
}
