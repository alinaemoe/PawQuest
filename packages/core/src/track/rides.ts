import { haversineDistanceM } from '../geo/haversine';

import type { TimedPoint } from './motion';

/**
 * Rides (D-62, section 5.1 item 3): stretches of a recorded walk spent in a car, a taxi or on a
 * bike. They stay in the record, but are not walking: they leave the distance, the pace and the
 * duration of the walk and are shown as "в дороге".
 */

export interface Ride {
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  /** Distance covered during the ride, in meters. */
  readonly distanceM: number;
}

export interface RideOptions {
  /** Faster than this (m/s) is not walking. Default 3 (10.8 km/h: a jog is slower, a bike is faster). */
  readonly minSpeedMps?: number;
  /** A ride must last at least this long, in seconds. Default 60. */
  readonly minDurationS?: number;
  /** A slow spell (a red light) up to this long does not end a ride. Default 90 s. */
  readonly mergeDipS?: number;
  /** Speeds above this (m/s) are glitches, not movement. Default 70 (252 km/h). */
  readonly maxSpeedMps?: number;
}

/**
 * Finds the rides of a track (points must be in time order; use the filtered track). A silence
 * of the GPS counts as a fast stretch when the position jumped at ride speed across it (a
 * tunnel, a signal lost in a taxi), and as no movement otherwise.
 */
export function findRides(points: readonly TimedPoint[], options: RideOptions = {}): Ride[] {
  const minSpeed = options.minSpeedMps ?? 3;
  const minDurationS = options.minDurationS ?? 60;
  const mergeDipS = options.mergeDipS ?? 90;
  const maxSpeed = options.maxSpeedMps ?? 70;

  const rides: Ride[] = [];
  let start: { ts: number; index: number } | null = null;
  let lastFastEnd = 0;
  let lastFastIndex = 0;

  const close = (): void => {
    if (start === null) {
      return;
    }
    const durationS = (lastFastEnd - start.ts) / 1000;
    if (durationS >= minDurationS) {
      let distanceM = 0;
      for (let i = start.index; i < lastFastIndex; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (a !== undefined && b !== undefined) {
          distanceM += haversineDistanceM(a, b);
        }
      }
      rides.push({ fromTs: start.ts, toTs: lastFastEnd, durationS, distanceM });
    }
    start = null;
  };

  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined || b.ts <= a.ts) {
      continue;
    }
    const speed = haversineDistanceM(a, b) / ((b.ts - a.ts) / 1000);
    if (speed >= minSpeed && speed <= maxSpeed) {
      start ??= { ts: a.ts, index: i };
      lastFastEnd = b.ts;
      lastFastIndex = i + 1;
    } else if (start !== null && (b.ts - lastFastEnd) / 1000 > mergeDipS) {
      close();
    }
  }
  close();
  return rides;
}

/** Seconds of the interval [fromTs, toTs] that lie inside rides. */
export function rideSecondsWithin(rides: readonly Ride[], fromTs: number, toTs: number): number {
  let total = 0;
  for (const ride of rides) {
    const from = Math.max(ride.fromTs, fromTs);
    const to = Math.min(ride.toTs, toTs);
    if (to > from) {
      total += (to - from) / 1000;
    }
  }
  return total;
}
