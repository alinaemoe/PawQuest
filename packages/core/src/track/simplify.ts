import { EARTH_RADIUS_M, isValidLatLon, type LatLon } from '../geo/haversine';

export interface SimplifyOptions {
  /** Maximum allowed deviation in metres. Default 3 (spec A-02). */
  readonly epsilonM?: number;
  /** Upper limit for the number of kept vertices. Default 1500 (spec A-02). */
  readonly maxVertices?: number;
}

const DEFAULT_EPSILON_M = 3;
const DEFAULT_MAX_VERTICES = 1500;
const METRES_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

type XY = readonly [number, number];

function distanceToSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Local planar projection in metres around the mean position (adequate at walking scale). */
function projectToMetres(points: readonly LatLon[]): XY[] {
  const n = points.length;
  let sumLat = 0;
  let sumLon = 0;
  for (const p of points) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  const meanLat = sumLat / n;
  const meanLon = sumLon / n;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  return points.map((p): XY => [
    (p.lon - meanLon) * cosLat * METRES_PER_DEGREE,
    (p.lat - meanLat) * METRES_PER_DEGREE,
  ]);
}

/**
 * Douglas-Peucker simplification (spec A-02) that returns the indices of the kept points, so
 * events and replay can keep pointing at the original, unsimplified data.
 *
 * Each vertex gets an importance: the largest deviation at the moment it is chosen, never more
 * than its parent's. A vertex is kept when its importance is strictly greater than `epsilonM`;
 * if more than `maxVertices` remain, the most important ones win. The first and last points are
 * always kept, and the result is sorted ascending.
 *
 * @throws RangeError for an invalid coordinate, a negative/NaN epsilon, or maxVertices < 2.
 */
export function simplifyTrack(points: readonly LatLon[], options: SimplifyOptions = {}): number[] {
  const epsilonM = options.epsilonM ?? DEFAULT_EPSILON_M;
  const maxVertices = options.maxVertices ?? DEFAULT_MAX_VERTICES;
  if (!Number.isFinite(epsilonM) || epsilonM < 0) {
    throw new RangeError('epsilonM must be a finite number >= 0');
  }
  if (!Number.isInteger(maxVertices) || maxVertices < 2) {
    throw new RangeError('maxVertices must be an integer >= 2');
  }
  if (!points.every((p) => isValidLatLon(p))) {
    throw new RangeError('every point must have finite lat in [-90, 90] and lon in [-180, 180]');
  }

  const n = points.length;
  if (n <= 2) {
    return Array.from({ length: n }, (_, i) => i);
  }

  const xy = projectToMetres(points);
  const importance = new Float64Array(n).fill(-1);
  importance[0] = Number.POSITIVE_INFINITY;
  importance[n - 1] = Number.POSITIVE_INFINITY;

  // Iterative (explicit stack): real tracks reach tens of thousands of points.
  const stack: [lo: number, hi: number, parentImportance: number][] = [
    [0, n - 1, Number.POSITIVE_INFINITY],
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const [lo, hi, parentImportance] = frame;
    const a = xy[lo];
    const b = xy[hi];
    if (a === undefined || b === undefined) {
      continue;
    }
    let farthest = -1;
    let maxDistance = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = xy[i];
      if (p === undefined) {
        continue;
      }
      const d = distanceToSegment(p, a, b);
      if (d > maxDistance) {
        maxDistance = d;
        farthest = i;
      }
    }
    if (farthest < 0) {
      continue;
    }
    const own = Math.min(maxDistance, parentImportance);
    importance[farthest] = own;
    stack.push([lo, farthest, own], [farthest, hi, own]);
  }

  const kept: number[] = [];
  for (let i = 0; i < n; i++) {
    if ((importance[i] ?? -1) > epsilonM) {
      kept.push(i);
    }
  }
  if (kept.length <= maxVertices) {
    return kept;
  }
  kept.sort((i, j) => (importance[j] ?? 0) - (importance[i] ?? 0) || i - j);
  return kept.slice(0, maxVertices).sort((i, j) => i - j);
}
