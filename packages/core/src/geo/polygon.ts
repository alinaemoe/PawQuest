import { EARTH_RADIUS_M, haversineDistanceM, isValidLatLon, type LatLon } from './haversine';

/**
 * Contours of places (D-62, S8): a ring of positions, drawn by the owner or taken from the map.
 * Small areas only (a park, a wood), so a flat approximation around the ring is exact enough.
 */

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;

export type Ring = readonly LatLon[];

/** A contour has at most this many vertices; more are thinned out. */
export const MAX_RING_VERTICES = 200;
/** A contour must enclose at least this much to be a place (a small yard). */
export const MIN_RING_AREA_M2 = 100;

interface XY {
  readonly x: number;
  readonly y: number;
}

function project(ring: Ring, origin: LatLon): XY[] {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return ring.map((p) => ({
    x: (p.lon - origin.lon) * M_PER_DEG * cos,
    y: (p.lat - origin.lat) * M_PER_DEG,
  }));
}

function centreOf(ring: Ring): LatLon {
  const b = ringBounds(ring);
  return { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
}

export function ringBounds(ring: Ring): {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of ring) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Area in square meters (absolute, whichever way the ring runs). */
export function ringAreaM2(ring: Ring): number {
  if (ring.length < 3) {
    return 0;
  }
  const xy = project(ring, centreOf(ring));
  let sum = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    if (a !== undefined && b !== undefined) {
      sum += a.x * b.y - b.x * a.y;
    }
  }
  return Math.abs(sum) / 2;
}

/** The centre of mass of the enclosed area (the middle of the box for a degenerate ring). */
export function ringCentroid(ring: Ring): LatLon {
  const origin = centreOf(ring);
  const xy = project(ring, origin);
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    return origin;
  }
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + cy / (3 * area) / M_PER_DEG,
    lon: origin.lon + cx / (3 * area) / (M_PER_DEG * cos),
  };
}

/** The farthest vertex from the centroid: a circle of this radius covers the whole contour. */
export function ringRadiusM(ring: Ring): number {
  const centre = ringCentroid(ring);
  return ring.reduce((max, p) => Math.max(max, haversineDistanceM(centre, p)), 0);
}

/** Whether a position is inside the ring (even-odd rule). */
export function pointInRing(point: LatLon, ring: Ring): boolean {
  const xy = project([point, ...ring], point);
  let inside = false;
  for (let i = 1, j = xy.length - 1; i < xy.length; j = i, i += 1) {
    const a = xy[i];
    const b = xy[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** The distance in meters from a position to the nearest edge of the ring. */
export function distanceToRingM(point: LatLon, ring: Ring): number {
  const xy = project(ring, point);
  let best = Infinity;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / len2));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const orient = (p: XY, q: XY, r: XY): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** True when no two edges of the ring cross (a bow tie is not a contour). */
export function isSimpleRing(ring: Ring): boolean {
  const xy = project(ring, centreOf(ring));
  const n = xy.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // edges that share a vertex cannot cross
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        continue;
      }
      const a = xy[i];
      const b = xy[(i + 1) % n];
      const c = xy[j];
      const d = xy[(j + 1) % n];
      if (
        a !== undefined &&
        b !== undefined &&
        c !== undefined &&
        d !== undefined &&
        segmentsCross(a, b, c, d)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Cleans a ring for keeping: drops a repeated closing vertex and vertices that sit on top of each
 * other, thins it to the vertex limit.
 * @throws RangeError when it cannot be a contour: an invalid position, fewer than three
 * distinct vertices, crossing edges or an area under 100 m².
 */
export function tidyRing(input: Ring, maxVertices = MAX_RING_VERTICES): LatLon[] {
  if (!input.every((p) => isValidLatLon(p))) {
    throw new RangeError('Every vertex of a contour needs a valid position');
  }
  let ring: LatLon[] = [];
  for (const p of input) {
    const last = ring[ring.length - 1];
    if (last === undefined || haversineDistanceM(last, p) >= 1) {
      ring.push({ lat: p.lat, lon: p.lon });
    }
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    ring.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    haversineDistanceM(first, last) < 1
  ) {
    ring = ring.slice(0, -1);
  }
  if (ring.length < 3) {
    throw new RangeError('A contour needs at least three distinct vertices');
  }
  if (ring.length > maxVertices) {
    const step = ring.length / maxVertices;
    ring = Array.from(
      { length: maxVertices },
      (_, i) => ring[Math.floor(i * step)] ?? ring[0] ?? { lat: 0, lon: 0 },
    );
  }
  if (!isSimpleRing(ring)) {
    throw new RangeError('The edges of a contour must not cross');
  }
  if (ringAreaM2(ring) < MIN_RING_AREA_M2) {
    throw new RangeError('A contour must enclose at least 100 square meters');
  }
  return ring;
}

/** A regular polygon of `sides` vertices around a centre: the start of drawing a round place. */
export function circleRing(centre: LatLon, radiusM: number, sides = 24): LatLon[] {
  const cos = Math.cos((centre.lat * Math.PI) / 180);
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * 2 * Math.PI;
    return {
      lat: centre.lat + (radiusM * Math.sin(angle)) / M_PER_DEG,
      lon: centre.lon + (radiusM * Math.cos(angle)) / (M_PER_DEG * cos),
    };
  });
}
