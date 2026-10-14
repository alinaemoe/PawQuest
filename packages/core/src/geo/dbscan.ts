import { EARTH_RADIUS_M, haversineDistanceM, isValidLatLon, type LatLon } from './haversine';

export interface DbscanResult {
  /** Indices of the input points per cluster, in order of discovery; each list ascending. */
  readonly clusters: readonly (readonly number[])[];
  /** Indices of points that belong to no cluster, ascending. */
  readonly noise: readonly number[];
}

const METRES_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

/**
 * DBSCAN density clustering with great-circle distances (spec A-12, decision D-51).
 *
 * A point is a core point when at least `minPts` points (itself included) lie within `epsM`
 * metres (boundary inclusive). Clusters grow from core points; border points join the first
 * cluster that reaches them. Neighbours are found with a uniform grid whose cells are at least
 * `epsM` wide, which gives the same result as comparing all pairs.
 *
 * Limitation: data crossing the antimeridian (longitude +-180) is not supported.
 *
 * @throws RangeError for an invalid point, a non-positive `epsM` or `minPts` below 1.
 */
export function dbscan(points: readonly LatLon[], epsM: number, minPts: number): DbscanResult {
  if (!Number.isFinite(epsM) || epsM <= 0) {
    throw new RangeError('epsM must be a finite number > 0');
  }
  if (!Number.isInteger(minPts) || minPts < 1) {
    throw new RangeError('minPts must be an integer >= 1');
  }
  if (!points.every((p) => isValidLatLon(p))) {
    throw new RangeError('every point must have finite lat in [-90, 90] and lon in [-180, 180]');
  }

  const n = points.length;
  const maxAbsLat = points.reduce((m, p) => Math.max(m, Math.abs(p.lat)), 0);
  const cosMax = Math.max(Math.cos((maxAbsLat * Math.PI) / 180), 1e-6);
  // 1 % safety margin: a great circle bulges poleward, so equal-latitude points can differ
  // slightly more in longitude than d / (R cos(lat)) suggests.
  const latStep = (epsM / METRES_PER_DEGREE) * 1.01;
  const lonStep = latStep / cosMax;

  const cells = new Map<string, number[]>();
  const cellOf = points.map((p): [number, number] => [
    Math.floor(p.lat / latStep),
    Math.floor(p.lon / lonStep),
  ]);
  cellOf.forEach(([ci, cj], i) => {
    const key = `${String(ci)},${String(cj)}`;
    const bucket = cells.get(key);
    if (bucket === undefined) {
      cells.set(key, [i]);
    } else {
      bucket.push(i);
    }
  });

  function neighbours(i: number): number[] {
    const p = points[i];
    const cell = cellOf[i];
    if (p === undefined || cell === undefined) {
      return [];
    }
    const found: number[] = [];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const bucket = cells.get(`${String(cell[0] + di)},${String(cell[1] + dj)}`);
        for (const j of bucket ?? []) {
          const q = points[j];
          if (q !== undefined && haversineDistanceM(p, q) <= epsM) {
            found.push(j);
          }
        }
      }
    }
    return found.sort((a, b) => a - b);
  }

  const UNVISITED = -2;
  const NOISE = -1;
  const label = new Array<number>(n).fill(UNVISITED);
  let clusterCount = 0;

  for (const i of points.keys()) {
    if (label[i] !== UNVISITED) {
      continue;
    }
    const seeds = neighbours(i);
    if (seeds.length < minPts) {
      label[i] = NOISE;
      continue;
    }
    const cluster = clusterCount;
    clusterCount += 1;
    label[i] = cluster;
    const queue = [...seeds];
    const queued = new Set(queue);
    // for-of over an array that grows while iterating visits the appended items too.
    for (const q of queue) {
      if (label[q] === NOISE) {
        label[q] = cluster; // border point previously marked as noise
      }
      if (label[q] !== UNVISITED) {
        continue;
      }
      label[q] = cluster;
      const reach = neighbours(q);
      if (reach.length >= minPts) {
        for (const r of reach) {
          if (!queued.has(r)) {
            queued.add(r);
            queue.push(r);
          }
        }
      }
    }
  }

  const clusters: number[][] = Array.from({ length: clusterCount }, () => []);
  const noise: number[] = [];
  label.forEach((l, i) => {
    if (l === NOISE) {
      noise.push(i);
    } else {
      clusters[l]?.push(i);
    }
  });
  return { clusters, noise };
}
