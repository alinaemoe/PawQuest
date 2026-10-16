import { EARTH_RADIUS_M, haversineDistanceM, type LatLon } from '../geo/haversine';
import { simplifyTrack } from '../track/simplify';

/**
 * Routes (D-61, D-62, A-27): a way that is walked again and again: "to Mom's", "round the block".
 * They are made of the walking legs between visits, never of whole walks, and rides are not
 * routes. Two legs are "the same way" when most of each lies near the other (in either
 * direction), they are about as long, and they begin and end at about the same places.
 */

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;

/** A leg shorter than this is not a way (a few steps to the door). */
export const MIN_ROUTE_LENGTH_M = 300;

export interface RouteLeg {
  /** The track of the leg, in time order. */
  readonly points: readonly LatLon[];
  /** Which walk it belongs to. */
  readonly walkId: string;
}

export interface RouteMatchOptions {
  /** How near the other line a point must be to count as on it. Default 30 m. */
  readonly nearM?: number;
  /** The share of each leg that must lie near the other. Default 0.8. */
  readonly minShare?: number;
  /** The longer leg may be at most this much longer than the shorter (0.25 = 25 %). Default 0.25. */
  readonly lengthTolerance?: number;
  /** The ends must be within this distance (in either orientation). Default 100 m. */
  readonly endReachM?: number;
}

/** A polyline thinned to a point every few meters, so that the comparison cost stays bounded. */
export function routeShape(points: readonly LatLon[], spacingM = 10): LatLon[] {
  if (points.length < 2) {
    return [...points];
  }
  const kept = simplifyTrack(points, { epsilonM: 8 }).flatMap((i) => {
    const p = points[i];
    return p === undefined ? [] : [p];
  });
  // fill long straight pieces so that a point is never farther than `spacingM` from the next
  const dense: LatLon[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const a = kept[i];
    const b = kept[i + 1];
    if (a === undefined) {
      continue;
    }
    dense.push(a);
    if (b !== undefined) {
      const steps = Math.floor(haversineDistanceM(a, b) / spacingM);
      for (let s = 1; s <= steps; s += 1) {
        const t = s / (steps + 1);
        dense.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
      }
    }
  }
  return dense;
}

export function pathLength(points: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) {
      total += haversineDistanceM(a, b);
    }
  }
  return total;
}

/** Distance in meters from a point to a polyline (flat approximation, good for walking scale). */
function distanceToLine(p: LatLon, line: readonly LatLon[]): number {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lon * M_PER_DEG * cos;
  const py = p.lat * M_PER_DEG;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    if (a === undefined || b === undefined) {
      continue;
    }
    const ax = a.lon * M_PER_DEG * cos;
    const ay = a.lat * M_PER_DEG;
    const dx = b.lon * M_PER_DEG * cos - ax;
    const dy = b.lat * M_PER_DEG - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  if (line.length === 1 && line[0] !== undefined) {
    best = haversineDistanceM(p, line[0]);
  }
  return best;
}

/** The share of `a` that lies within `nearM` of the line `b`. */
function shareNear(a: readonly LatLon[], b: readonly LatLon[], nearM: number): number {
  if (a.length === 0) {
    return 0;
  }
  let near = 0;
  for (const p of a) {
    if (distanceToLine(p, b) <= nearM) {
      near += 1;
    }
  }
  return near / a.length;
}

export interface RouteMatch {
  /** The worse of the two shares: how much of each leg lies on the other. */
  readonly share: number;
  /** True when the legs run the same way round (or are loops); false when one is the reverse. */
  readonly sameDirection: boolean;
}

/**
 * Whether two legs are the same way, and in which direction the second runs against the first.
 * `a` and `b` are shapes made by `routeShape`.
 */
export function matchRoutes(
  a: readonly LatLon[],
  b: readonly LatLon[],
  options: RouteMatchOptions = {},
): RouteMatch | null {
  const nearM = options.nearM ?? 30;
  const minShare = options.minShare ?? 0.8;
  const tolerance = options.lengthTolerance ?? 0.25;
  const endReachM = options.endReachM ?? 100;
  const a0 = a[0];
  const a1 = a[a.length - 1];
  const b0 = b[0];
  const b1 = b[b.length - 1];
  if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) {
    return null;
  }
  const la = pathLength(a);
  const lb = pathLength(b);
  if (Math.min(la, lb) === 0 || Math.max(la, lb) > Math.min(la, lb) * (1 + tolerance)) {
    return null;
  }
  const same = haversineDistanceM(a0, b0) <= endReachM && haversineDistanceM(a1, b1) <= endReachM;
  const reverse =
    haversineDistanceM(a0, b1) <= endReachM && haversineDistanceM(a1, b0) <= endReachM;
  if (!same && !reverse) {
    return null;
  }
  const share = Math.min(shareNear(a, b, nearM), shareNear(b, a, nearM));
  if (share < minShare) {
    return null;
  }
  // a loop begins and ends at one place: both readings fit, the first wins
  return { share, sameDirection: same };
}

export interface RouteCandidate {
  /** Indices of the legs of the group, in the order given. */
  readonly legIndices: readonly number[];
  /** The leg closest to all the others: the route's own line. */
  readonly medoid: number;
  readonly walkCount: number;
  readonly lengthM: number;
  /** The route begins and ends at one place ("round the block"). */
  readonly loop: boolean;
}

export interface FindRoutesOptions extends RouteMatchOptions {
  /** A group needs at least this many legs. Default 3. */
  readonly minLegs?: number;
  /** ... from at least this many walks. Default 2. */
  readonly minWalks?: number;
  /** Shorter legs are not ways. Default 300 m. */
  readonly minLengthM?: number;
}

/**
 * Groups the legs that are the same way (D-61): connected by pairwise matches, at least three
 * legs from two or more walks. Shapes are made here, so the input is the raw leg tracks.
 */
export function findRoutes(
  legs: readonly RouteLeg[],
  options: FindRoutesOptions = {},
): RouteCandidate[] {
  const minLegs = options.minLegs ?? 3;
  const minWalks = options.minWalks ?? 2;
  const minLength = options.minLengthM ?? MIN_ROUTE_LENGTH_M;
  const shapes = legs.map((leg) => routeShape(leg.points));
  const usable = shapes.map((s) => pathLength(s) >= minLength);
  const n = legs.length;
  const share: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while ((parent[root] ?? root) !== root) {
      root = parent[root] ?? root;
    }
    return root;
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = shapes[i];
      const b = shapes[j];
      if (!usable[i] || !usable[j] || a === undefined || b === undefined) {
        continue;
      }
      const m = matchRoutes(a, b, options);
      if (m !== null) {
        (share[i] as number[])[j] = m.share;
        (share[j] as number[])[i] = m.share;
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    if (usable[i]) {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), i]);
    }
  }
  const found: RouteCandidate[] = [];
  for (const members of groups.values()) {
    const walks = new Set(members.map((i) => legs[i]?.walkId));
    if (members.length < minLegs || walks.size < minWalks) {
      continue;
    }
    let medoid = members[0] ?? 0;
    let bestScore = -1;
    for (const i of members) {
      const score = members.reduce((sum, j) => sum + (i === j ? 1 : ((share[i] ?? [])[j] ?? 0)), 0);
      if (score > bestScore) {
        bestScore = score;
        medoid = i;
      }
    }
    const shape = shapes[medoid] ?? [];
    const first = shape[0];
    const last = shape[shape.length - 1];
    found.push({
      legIndices: members,
      medoid,
      walkCount: walks.size,
      lengthM: pathLength(shape),
      loop: first !== undefined && last !== undefined && haversineDistanceM(first, last) <= 60,
    });
  }
  return found.sort((a, b) => b.legIndices.length - a.legIndices.length);
}

/**
 * Whether a leg is a pass of a saved route, and in which direction: "forward" along the route's
 * own line, "backward" against it. Null when it is another way.
 */
export function passOfRoute(
  route: readonly LatLon[],
  leg: readonly LatLon[],
  options: RouteMatchOptions = {},
): { readonly direction: 'forward' | 'backward'; readonly share: number } | null {
  const a = routeShape(route);
  const b = routeShape(leg);
  const m = matchRoutes(a, b, options);
  return m === null
    ? null
    : { direction: m.sameDirection ? 'forward' : 'backward', share: m.share };
}
