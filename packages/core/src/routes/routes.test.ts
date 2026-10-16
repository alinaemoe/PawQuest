import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, type LatLon } from '../geo/haversine';

import {
  findRoutes,
  matchRoutes,
  passOfRoute,
  pathLength,
  routeShape,
  type RouteLeg,
} from './routes';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);

/** A position `x` meters east and `y` meters north of the origin. */
const at = (x: number, y: number): LatLon => ({
  lat: 55 + y / M_PER_DEG,
  lon: 37 + x / (M_PER_DEG * COS),
});

/** Deterministic noise in [-1, 1). */
function noise(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A polyline through the corners, with a fix about every 5 m and noise of up to `jitterM`. */
function walkLine(
  corners: readonly (readonly [number, number])[],
  jitterM = 0,
  seed = 1,
  spacingM = 5,
): LatLon[] {
  const r = noise(seed);
  const out: LatLon[] = [];
  for (let i = 0; i + 1 < corners.length; i += 1) {
    const [x0, y0] = corners[i] ?? [0, 0];
    const [x1, y1] = corners[i + 1] ?? [0, 0];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / spacingM));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push(at(x0 + (x1 - x0) * t + r() * jitterM, y0 + (y1 - y0) * t + r() * jitterM));
    }
  }
  const [lx, ly] = corners[corners.length - 1] ?? [0, 0];
  out.push(at(lx + r() * jitterM, ly + r() * jitterM));
  return out;
}

const ROAD = [
  [0, 0],
  [600, 0],
  [600, 300],
] as const; // 900 m
const reverse = (corners: readonly (readonly [number, number])[]) => [...corners].reverse();
const leg = (points: LatLon[], walkId: string): RouteLeg => ({ points, walkId });

describe('routeShape and pathLength', () => {
  it('keeps the length of a line and never leaves a gap longer than the spacing', () => {
    const line = walkLine(ROAD);
    const shape = routeShape(line, 10);
    expect(pathLength(shape)).toBeGreaterThan(890);
    expect(pathLength(shape)).toBeLessThan(910);
    for (let i = 1; i < shape.length; i += 1) {
      const a = shape[i - 1];
      const b = shape[i];
      if (a !== undefined && b !== undefined) {
        expect(pathLength([a, b])).toBeLessThanOrEqual(310);
      }
    }
    expect(shape.length).toBeLessThan(line.length);
  });

  it('handles one point and none', () => {
    expect(routeShape([])).toEqual([]);
    expect(routeShape([at(0, 0)])).toHaveLength(1);
    expect(pathLength([])).toBe(0);
  });
});

describe('matchRoutes', () => {
  const road = routeShape(walkLine(ROAD));

  it('the same way twice matches, noise of 5-10 m included', () => {
    const again = routeShape(walkLine(ROAD, 8, 7, 15));
    const m = matchRoutes(road, again);
    expect(m?.sameDirection).toBe(true);
    expect(m?.share).toBeGreaterThan(0.9);
  });

  it('the way back is the same way in the other direction', () => {
    const back = routeShape(walkLine(reverse(ROAD), 5, 3));
    expect(matchRoutes(road, back)).toMatchObject({ sameDirection: false });
  });

  it('crossing paths are not the same way', () => {
    const cross = routeShape(
      walkLine([
        [0, 300],
        [600, 0],
        [600, 300],
      ]),
    );
    expect(matchRoutes(road, cross)).toBeNull();
  });

  it('a path that shares only a part is not the same way', () => {
    const partly = routeShape(
      walkLine([
        [0, 0],
        [360, 0],
        [360, 500],
        [800, 500],
      ]),
    );
    expect(matchRoutes(road, partly)).toBeNull();
  });

  it('a much longer or shorter way is another way', () => {
    const longer = routeShape(
      walkLine([
        [0, 0],
        [600, 0],
        [600, 300],
        [600, 800],
      ]),
    );
    expect(matchRoutes(road, longer)).toBeNull();
  });

  it('the shared part has to be 80 %: just above and below the limit', () => {
    const dense = (shiftLast: number): LatLon[] =>
      Array.from({ length: 100 }, (_, i) => at(i * 10, i >= 100 - shiftLast ? 60 : 0));
    const base = dense(0);
    const pair = matchRoutes(base, dense(15), { endReachM: 100 });
    expect(pair).not.toBeNull();
    const share = pair?.share ?? 0;
    expect(matchRoutes(base, dense(15), { minShare: share - 0.005 })).not.toBeNull();
    expect(matchRoutes(base, dense(15), { minShare: share + 0.005 })).toBeNull();
    expect(matchRoutes(base, dense(40))).toBeNull();
  });

  it('ways that begin and end in other places are not the same', () => {
    const shifted = routeShape(walkLine(ROAD.map(([x, y]) => [x + 400, y] as const)));
    expect(matchRoutes(road, shifted)).toBeNull();
  });

  it('empty lines match nothing', () => {
    expect(matchRoutes([], road)).toBeNull();
    expect(matchRoutes(road, [])).toBeNull();
  });
});

describe('findRoutes (A-27)', () => {
  const there = (walkId: string, seed: number) => leg(walkLine(ROAD, 6, seed), walkId);
  const back = (walkId: string, seed: number) => leg(walkLine(reverse(ROAD), 6, seed), walkId);

  it('three passes of one road from two walks, in both directions, are one route', () => {
    const found = findRoutes([there('a', 1), back('a', 2), there('b', 3)]);
    expect(found).toHaveLength(1);
    expect(found[0]?.legIndices).toEqual([0, 1, 2]);
    expect(found[0]?.walkCount).toBe(2);
    expect(found[0]?.lengthM).toBeGreaterThan(850);
    expect(found[0]?.loop).toBe(false);
  });

  it('two passes are not yet a habit, and three from one walk are not either', () => {
    expect(findRoutes([there('a', 1), there('b', 2)])).toEqual([]);
    expect(findRoutes([there('a', 1), back('a', 2), there('a', 3)])).toEqual([]);
  });

  it('different roads make different routes, each with its own passes', () => {
    const other = [
      [0, 1000],
      [900, 1000],
      [900, 1400],
    ] as const;
    const o = (walkId: string, seed: number) => leg(walkLine(other, 6, seed), walkId);
    const found = findRoutes([
      there('a', 1),
      o('a', 2),
      there('b', 3),
      o('b', 4),
      there('c', 5),
      o('c', 6),
    ]);
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.legIndices.length)).toEqual([3, 3]);
    expect(new Set(found.flatMap((f) => f.legIndices)).size).toBe(6);
  });

  it('legs shorter than 300 m are not ways', () => {
    const short = (walkId: string, seed: number) =>
      leg(
        walkLine(
          [
            [0, 0],
            [200, 0],
          ],
          3,
          seed,
        ),
        walkId,
      );
    expect(findRoutes([short('a', 1), short('b', 2), short('c', 3)])).toEqual([]);
  });

  it('a round walk is a loop route', () => {
    const circle = (seed: number, walkId: string) => {
      const corners: (readonly [number, number])[] = Array.from({ length: 41 }, (_, i) => {
        const angle = (i / 40) * 2 * Math.PI;
        return [150 * Math.cos(angle), 150 * Math.sin(angle)] as const;
      });
      return leg(walkLine(corners, 5, seed), walkId);
    };
    const found = findRoutes([circle(1, 'a'), circle(2, 'b'), circle(3, 'c')]);
    expect(found).toHaveLength(1);
    expect(found[0]?.loop).toBe(true);
  });

  it('the medoid is the pass closest to the others', () => {
    const found = findRoutes([there('a', 1), there('b', 2), leg(walkLine(ROAD, 25, 9), 'c')]);
    expect(found[0]?.medoid).not.toBe(2);
  });

  it('no legs, no routes', () => {
    expect(findRoutes([])).toEqual([]);
  });
});

describe('passOfRoute', () => {
  const route = walkLine(ROAD);

  it('says forward or backward, or nothing for another way', () => {
    expect(passOfRoute(route, walkLine(ROAD, 5, 4))?.direction).toBe('forward');
    expect(passOfRoute(route, walkLine(reverse(ROAD), 5, 5))?.direction).toBe('backward');
    expect(
      passOfRoute(
        route,
        walkLine(
          [
            [0, 900],
            [600, 900],
            [600, 1200],
          ],
          5,
          6,
        ),
      ),
    ).toBeNull();
  });
});
