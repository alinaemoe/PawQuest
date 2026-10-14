import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dbscan } from './dbscan';
import { EARTH_RADIUS_M, haversineDistanceM, type LatLon } from './haversine';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);

/** A point `n` metres north and `e` metres east of (55, 37). */
function pt(n: number, e: number): LatLon {
  return { lat: 55 + n / M_PER_DEG, lon: 37 + e / (M_PER_DEG * COS) };
}

/** Textbook DBSCAN over all pairs, with the same visiting order, as an independent reference. */
function referenceDbscan(points: readonly LatLon[], eps: number, minPts: number) {
  // Neighbour lists by comparing every pair (no grid).
  const near = points.map((p) =>
    points.flatMap((q, j) => (haversineDistanceM(p, q) <= eps ? [j] : [])),
  );
  const label = new Map<number, number>(); // index -> cluster id, or -1 for noise
  let clusterCount = 0;
  for (const [i, seeds] of near.entries()) {
    if (label.has(i)) {
      continue;
    }
    if (seeds.length < minPts) {
      label.set(i, -1);
      continue;
    }
    label.set(i, clusterCount);
    const queue = [...seeds];
    for (const q of queue) {
      if (label.get(q) === -1) {
        label.set(q, clusterCount);
      }
      if (label.has(q)) {
        continue;
      }
      label.set(q, clusterCount);
      const reach = near[q] ?? [];
      if (reach.length >= minPts) {
        queue.push(...reach);
      }
    }
    clusterCount += 1;
  }
  const clusters: number[][] = Array.from({ length: clusterCount }, () => []);
  const noise: number[] = [];
  for (const i of points.keys()) {
    const l = label.get(i);
    if (l === -1) {
      noise.push(i);
    } else if (l !== undefined) {
      clusters[l]?.push(i);
    }
  }
  return { clusters, noise };
}

describe('dbscan', () => {
  it('returns nothing for no points', () => {
    expect(dbscan([], 40, 3)).toEqual({ clusters: [], noise: [] });
  });

  it('forms one cluster from three nearby points', () => {
    const r = dbscan([pt(0, 0), pt(5, 5), pt(-5, 3)], 40, 3);
    expect(r.clusters).toEqual([[0, 1, 2]]);
    expect(r.noise).toEqual([]);
  });

  it('treats fewer points than minPts as noise', () => {
    const r = dbscan([pt(0, 0), pt(5, 5)], 40, 3);
    expect(r.clusters).toEqual([]);
    expect(r.noise).toEqual([0, 1]);
  });

  it('counts the point itself towards minPts', () => {
    expect(dbscan([pt(0, 0), pt(5, 0)], 40, 2).clusters).toEqual([[0, 1]]);
    expect(dbscan([pt(0, 0)], 40, 1).clusters).toEqual([[0]]);
  });

  it('includes points exactly at eps', () => {
    const a = pt(0, 0);
    const b = pt(30, 0);
    const exact = haversineDistanceM(a, b);
    expect(dbscan([a, b], exact, 2).clusters).toEqual([[0, 1]]);
    expect(dbscan([a, b], exact - 1e-6, 2).clusters).toEqual([]);
  });

  it('links a chain through density-reachability (A-B and B-C within eps, A-C beyond)', () => {
    const r = dbscan([pt(0, 0), pt(30, 0), pt(60, 0), pt(90, 0)], 35, 2);
    expect(r.clusters).toEqual([[0, 1, 2, 3]]);
  });

  it('separates two groups far apart and reports isolated points as noise', () => {
    const points = [
      pt(0, 0),
      pt(3, 3),
      pt(-3, 2),
      pt(500, 500),
      pt(503, 498),
      pt(497, 502),
      pt(2000, 0),
    ];
    const r = dbscan(points, 40, 3);
    expect(r.clusters).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(r.noise).toEqual([6]);
  });

  it('attaches a border point to a cluster even if it was first seen as noise', () => {
    // index 0 is within eps of the dense group but has too few neighbours itself.
    const points = [pt(0, 0), pt(35, 0), pt(40, 5), pt(40, -5), pt(45, 0)];
    const r = dbscan(points, 38, 3);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]).toContain(0);
    expect(r.noise).toEqual([]);
  });

  it('rejects invalid arguments with a RangeError', () => {
    expect(() => dbscan([pt(0, 0)], 0, 3)).toThrow(RangeError);
    expect(() => dbscan([pt(0, 0)], Number.NaN, 3)).toThrow(RangeError);
    expect(() => dbscan([pt(0, 0)], 40, 0)).toThrow(RangeError);
    expect(() => dbscan([pt(0, 0)], 40, 2.5)).toThrow(RangeError);
    expect(() => dbscan([{ lat: 91, lon: 0 }], 40, 1)).toThrow(RangeError);
  });

  it('works near the poles without dividing by zero', () => {
    const r = dbscan(
      [
        { lat: 89.99999, lon: 0 },
        { lat: 89.99999, lon: 90 },
        { lat: 90, lon: 0 },
      ],
      40,
      3,
    );
    expect(r.clusters).toEqual([[0, 1, 2]]);
  });

  it('property: equals the brute-force reference on random point sets', () => {
    const pointsArb = fc.array(
      fc.tuple(
        fc.double({ min: -150, max: 150, noNaN: true }),
        fc.double({ min: -150, max: 150, noNaN: true }),
      ),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(pointsArb, fc.integer({ min: 1, max: 5 }), (offsets, minPts) => {
        const points = offsets.map(([n, e]) => pt(n, e));
        const actual = dbscan(points, 40, minPts);
        const expected = referenceDbscan(points, 40, minPts);
        expect(actual).toEqual(expected);
      }),
    );
  });
});
