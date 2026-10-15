import { haversineDistanceM, isValidLatLon, type LatLon } from '../geo/haversine';
import { median } from '../util/median';

import type { SavedPlace } from './suggest';

/** A stay (see track/stays) as the clustering needs it. */
export interface StayInput extends LatLon {
  readonly walkId: string;
  readonly durationS: number;
  /** How far the stay spreads around its centre, in meters. */
  readonly radiusM: number;
}

export interface StayCluster extends LatLon {
  /** A radius that covers the visits: their spread plus a margin, never below the minimum. */
  readonly radiusM: number;
  readonly stayCount: number;
  readonly walkCount: number;
  readonly totalDurationS: number;
  /** Indices into the input, ascending. */
  readonly stayIndices: readonly number[];
}

export interface ClusterStaysOptions {
  /** Two stays are always neighbours when their centres are this close. Default 40 m. */
  readonly minReachM?: number;
  /** ...and when closer than this many times the larger of their radii. Default 1.5. */
  readonly reachFactor?: number;
  /** Stays needed for a cluster, the stay itself included. Default 3. */
  readonly minStays?: number;
  /** A cluster must span at least this many different walks. Default 2. */
  readonly minWalks?: number;
  /** A cluster whose centre is inside a saved place (its radius, at least this) is skipped. Default 60 m. */
  readonly minDistanceToSavedM?: number;
  /** The proposed radius is never below this. Default 40 m. */
  readonly minRadiusM?: number;
  readonly maxRadiusM?: number;
  /** Added to the spread of the visits when proposing a radius. Default 15 m. */
  readonly marginM?: number;
}

function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
}

/**
 * Groups repeated stays into candidate places (spec A-12b, D-62). Unlike clustering with one fixed
 * radius, the reach depends on the stays themselves: visits to a park wander over hundreds of
 * meters and their centres are far apart, visits to a doorway are not. Two stays are neighbours
 * when their centres are closer than `max(minReachM, reachFactor * larger radius)`; the clusters are
 * density-based (DBSCAN) over that relation. A cluster needs enough stays from enough walks, lies
 * outside every saved place, and a smaller cluster inside a larger one is dropped (the stand at a
 * bench belongs to the park). Longest total time first.
 *
 * @throws RangeError for invalid coordinates, durations or radii.
 */
export function clusterStays(
  stays: readonly StayInput[],
  savedPlaces: readonly SavedPlace[],
  options: ClusterStaysOptions = {},
): StayCluster[] {
  const minReachM = options.minReachM ?? 40;
  const reachFactor = options.reachFactor ?? 1.5;
  const minStays = options.minStays ?? 3;
  const minWalks = options.minWalks ?? 2;
  const minDistanceToSavedM = options.minDistanceToSavedM ?? 60;
  const minRadiusM = options.minRadiusM ?? 40;
  const maxRadiusM = options.maxRadiusM ?? 1000;
  const marginM = options.marginM ?? 15;
  for (const s of stays) {
    if (!isValidLatLon(s) || !Number.isFinite(s.durationS) || !(s.radiusM >= 0)) {
      throw new RangeError('stays need valid coordinates, a finite duration and a radius');
    }
  }

  const n = stays.length;
  const reach = (a: StayInput, b: StayInput): number =>
    Math.max(minReachM, reachFactor * Math.max(a.radiusM, b.radiusM));
  const neighbours = (i: number): number[] => {
    const a = stays[i];
    if (a === undefined) {
      return [];
    }
    const found: number[] = [];
    stays.forEach((b, k) => {
      if (haversineDistanceM(a, b) <= reach(a, b)) {
        found.push(k);
      }
    });
    return found;
  };

  const NOISE = -1;
  const label = new Array<number | undefined>(n).fill(undefined);
  const groups: number[][] = [];
  for (const i of stays.keys()) {
    if (label[i] !== undefined) {
      continue;
    }
    const seeds = neighbours(i);
    if (seeds.length < minStays) {
      label[i] = NOISE;
      continue;
    }
    const id = groups.length;
    const members: number[] = [];
    groups.push(members);
    const queue = [...seeds];
    label[i] = id;
    members.push(i);
    // the queue grows while it is walked: `for...of` on an array visits the appended items too
    for (const k of queue) {
      if (label[k] === NOISE) {
        label[k] = id; // a border point: reachable, but not dense itself
        members.push(k);
      }
      if (label[k] !== undefined) {
        continue;
      }
      label[k] = id;
      members.push(k);
      const further = neighbours(k);
      if (further.length >= minStays) {
        queue.push(...further);
      }
    }
  }

  const clusters: StayCluster[] = [];
  for (const group of groups) {
    const members = group.flatMap((i) => {
      const s = stays[i];
      return s === undefined ? [] : [{ i, s }];
    });
    const walkCount = new Set(members.map((m) => m.s.walkId)).size;
    if (walkCount < minWalks) {
      continue;
    }
    const centre: LatLon = {
      lat: median(members.map((m) => m.s.lat)),
      lon: median(members.map((m) => m.s.lon)),
    };
    if (
      savedPlaces.some(
        (place) =>
          haversineDistanceM(place, centre) <= Math.max(minDistanceToSavedM, place.radiusM ?? 0),
      )
    ) {
      continue;
    }
    const covering = percentile(
      members.map((m) => haversineDistanceM(centre, m.s) + m.s.radiusM),
      0.9,
    );
    clusters.push({
      ...centre,
      radiusM: Math.min(maxRadiusM, Math.max(minRadiusM, Math.round(covering + marginM))),
      stayCount: members.length,
      walkCount,
      totalDurationS: members.reduce((sum, m) => sum + m.s.durationS, 0),
      stayIndices: members.map((m) => m.i).sort((a, b) => a - b),
    });
  }

  // a smaller cluster inside a larger one is part of it
  const bySize = [...clusters].sort((a, b) => b.radiusM - a.radiusM);
  const kept: StayCluster[] = [];
  for (const c of bySize) {
    if (!kept.some((big) => haversineDistanceM(big, c) <= big.radiusM)) {
      kept.push(c);
    }
  }
  // ties are broken by position, so the order does not depend on the order of the input
  return kept.sort(
    (a, b) =>
      b.totalDurationS - a.totalDurationS ||
      b.radiusM - a.radiusM ||
      a.lat - b.lat ||
      a.lon - b.lon,
  );
}
