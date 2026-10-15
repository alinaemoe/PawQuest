import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM, type LatLon } from '../geo/haversine';

import { clusterStays, type StayInput } from './stayClusters';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);

function at(north: number, east: number): LatLon {
  return { lat: 55 + north / M_PER_DEG, lon: 37 + east / (M_PER_DEG * COS) };
}

function stay(walkId: string, n: number, e: number, radiusM = 3, durationS = 300): StayInput {
  return { ...at(n, e), walkId, durationS, radiusM };
}

/** The first item of a list a test just built. */
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) {
    throw new Error('expected an item');
  }
  return item;
}

describe('clusterStays (A-12b)', () => {
  const doorway = [stay('w1', 0, 0), stay('w2', 6, 4), stay('w3', -5, 2)];

  it('three stands at a doorway are one small place at the minimum size', () => {
    const [c] = clusterStays(doorway, []);
    expect(c?.stayCount).toBe(3);
    expect(c?.walkCount).toBe(3);
    expect(c?.totalDurationS).toBe(900);
    expect(c?.stayIndices).toEqual([0, 1, 2]);
    expect(c?.radiusM).toBe(40);
    expect(haversineDistanceM(c ?? at(0, 0), at(0, 2))).toBeLessThan(6);
  });

  it('visits to a park wander far apart and still make one place that covers them', () => {
    const park = [
      stay('w1', 0, 0, 100, 1500),
      stay('w2', 90, 60, 90, 1400),
      stay('w3', -70, 90, 110, 1300),
    ];
    const clusters = clusterStays(park, []);
    expect(clusters).toHaveLength(1);
    // the centres are up to ~140 m apart, which a fixed 40 m reach would never join
    expect(clusters[0]?.radiusM).toBeGreaterThan(130);
    expect(clusters[0]?.walkCount).toBe(3);
  });

  it('a wide stay and a narrow one at the same place belong together', () => {
    const mixed = [stay('w1', 0, 0, 82), stay('w2', 40, 20, 36), stay('w3', -20, 30, 90)];
    expect(clusterStays(mixed, [])).toHaveLength(1);
  });

  it('needs enough stays, from at least two walks', () => {
    expect(clusterStays(doorway.slice(0, 2), [])).toEqual([]);
    const oneWalk = [stay('w1', 0, 0), stay('w1', 4, 3), stay('w1', -3, 2)];
    expect(clusterStays(oneWalk, [])).toEqual([]);
    expect(clusterStays(oneWalk, [], { minWalks: 1 })).toHaveLength(1);
    expect(clusterStays(doorway.slice(0, 2), [], { minStays: 2 })).toHaveLength(1);
  });

  it('stays that are far apart do not join', () => {
    const apart = [stay('w1', 0, 0), stay('w2', 0, 500), stay('w3', 0, 1000)];
    expect(clusterStays(apart, [])).toEqual([]);
  });

  it('skips a cluster inside a saved place, however large, and inside 60 m of a small one', () => {
    const centre = clusterStays(doorway, [])[0] as LatLon;
    const farOff = { ...at(0, 250) };
    const farStays = [stay('w1', 0, 250), stay('w2', 5, 255), stay('w3', -4, 253)];
    expect(clusterStays(farStays, [{ ...at(0, 0), radiusM: 300 }])).toEqual([]);
    expect(clusterStays(farStays, [{ ...at(0, 0), radiusM: 100 }])).toHaveLength(1);
    const justInside = { lat: centre.lat + 60 / M_PER_DEG, lon: centre.lon };
    const justOutside = { lat: centre.lat + 61 / M_PER_DEG, lon: centre.lon };
    expect(clusterStays(doorway, [justInside])).toEqual([]);
    expect(clusterStays(doorway, [justOutside])).toHaveLength(1);
    expect(farOff.lat).toBeGreaterThan(0);
  });

  it('a stand inside a park-sized cluster is dropped, one outside it stays', () => {
    const park = [
      stay('w1', 0, 0, 100, 1500),
      stay('w2', 60, 40, 100, 1500),
      stay('w3', -50, 60, 100, 1500),
    ];
    const benchInside = [stay('w1', 10, 10), stay('w2', 12, 8), stay('w3', 9, 12)];
    const hutOutside = [stay('w1', 800, 0), stay('w2', 803, 2), stay('w3', 798, -2)];
    const clusters = clusterStays([...park, ...benchInside, ...hutOutside], []);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.radiusM).sort((a, b) => b - a)[0]).toBeGreaterThan(100);
    expect(clusters.some((c) => haversineDistanceM(c, at(800, 0)) < 10)).toBe(true);
  });

  it('longest total time first', () => {
    const short = [stay('w1', 0, 0, 3, 200), stay('w2', 2, 1, 3, 200), stay('w3', 1, 2, 3, 200)];
    const long = [
      stay('w1', 3000, 0, 3, 900),
      stay('w2', 3002, 1, 3, 900),
      stay('w3', 3001, 2, 3, 900),
    ];
    const clusters = clusterStays([...short, ...long], []);
    expect(clusters.map((c) => c.totalDurationS)).toEqual([2700, 600]);
  });

  it('honours custom options', () => {
    const wide = clusterStays(doorway, [], { minRadiusM: 90, marginM: 0 });
    expect(wide[0]?.radiusM).toBe(90);
    const capped = clusterStays(
      [stay('w1', 0, 0, 2000), stay('w2', 1, 1, 2000), stay('w3', 2, 2, 2000)],
      [],
      { maxRadiusM: 500 },
    );
    expect(capped[0]?.radiusM).toBe(500);
  });

  it('a border stay joins a dense cluster but does not extend it', () => {
    // three dense stays and a fourth that only touches the edge: it joins, nothing beyond it does
    const dense = [stay('w1', 0, 0), stay('w2', 5, 0), stay('w3', 10, 0)];
    const edge = stay('w4', 45, 0);
    const beyond = stay('w5', 90, 0);
    const [cluster] = clusterStays([...dense, edge, beyond], []);
    expect(cluster?.stayIndices).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic and gives the same place whatever the input order', () => {
    const items = [...doorway, stay('w4', 400, 0), stay('w5', 402, 1), stay('w6', 401, 2)];
    const forward = clusterStays(items, []);
    const backward = clusterStays([...items].reverse(), []);
    expect(forward).toEqual(clusterStays(items, []));
    expect(backward.map((c) => c.stayCount)).toEqual(forward.map((c) => c.stayCount));
    expect(backward[0]?.lat).toBeCloseTo(forward[0]?.lat ?? 0, 8);
  });

  it('fuzz: random stays always give clean clusters', () => {
    let state = 12345;
    const rand = (): number => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 4_294_967_296;
    };
    for (let round = 0; round < 80; round++) {
      const count = Math.floor(rand() * 60);
      const items: StayInput[] = Array.from({ length: count }, (_, i) => {
        const hub = Math.floor(rand() * 4);
        return stay(
          `w${String(Math.floor(rand() * 8))}`,
          hub * 700 + (rand() - 0.5) * 300 * rand(),
          hub * 400 + (rand() - 0.5) * 300 * rand(),
          rand() * 150,
          180 + i,
        );
      });
      const saved = rand() < 0.5 ? [{ ...at(0, 0), radiusM: rand() * 400 }] : [];
      const clusters = clusterStays(items, saved);
      const used = new Set<number>();
      for (const c of clusters) {
        expect(c.stayCount).toBeGreaterThanOrEqual(3);
        expect(c.walkCount).toBeGreaterThanOrEqual(2);
        expect(c.radiusM).toBeGreaterThanOrEqual(40);
        expect(c.radiusM).toBeLessThanOrEqual(1000);
        for (const index of c.stayIndices) {
          expect(used.has(index), `round ${String(round)}`).toBe(false);
          used.add(index);
        }
        // never inside a saved place, never inside another proposal
        for (const place of saved) {
          expect(haversineDistanceM(place, c)).toBeGreaterThan(Math.max(60, place.radiusM));
        }
        for (const other of clusters) {
          if (other !== c) {
            expect(haversineDistanceM(other, c) > other.radiusM).toBe(true);
          }
        }
      }
    }
  });

  it('works on nothing and rejects invalid input', () => {
    expect(clusterStays([], [])).toEqual([]);
    expect(() => clusterStays([{ ...first(doorway), lat: 91 }], [])).toThrow(RangeError);
    expect(() => clusterStays([{ ...first(doorway), durationS: Number.NaN }], [])).toThrow(
      RangeError,
    );
    expect(() => clusterStays([{ ...first(doorway), radiusM: -1 }], [])).toThrow(RangeError);
  });
});
