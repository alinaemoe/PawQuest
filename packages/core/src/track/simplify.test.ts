import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M } from '../geo/haversine';

import { simplifyTrack } from './simplify';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const BASE_LAT = 55;
const BASE_LON = 37;
const COS_BASE = Math.cos((BASE_LAT * Math.PI) / 180);

/** A point `northM`/`eastM` metres from the base point. */
function pt(northM: number, eastM: number): { lat: number; lon: number } {
  return { lat: BASE_LAT + northM / M_PER_DEG, lon: BASE_LON + eastM / (M_PER_DEG * COS_BASE) };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${String(index)}`);
  }
  return item;
}

describe('simplifyTrack', () => {
  it('returns every index for tracks of up to two points', () => {
    expect(simplifyTrack([])).toEqual([]);
    expect(simplifyTrack([pt(0, 0)])).toEqual([0]);
    expect(simplifyTrack([pt(0, 0), pt(5, 5)])).toEqual([0, 1]);
  });

  it('collapses a straight line to its two endpoints', () => {
    const line = range(50).map((i) => pt(0, i * 2));
    expect(simplifyTrack(line)).toEqual([0, 49]);
  });

  it('keeps the corner of an L-shaped path', () => {
    const east = range(11).map((i) => pt(0, i * 10)); // 0..100 m east
    const north = range(11).map((i) => pt(i * 10, 100)); // then 0..100 m north
    const track = [...east, ...north.slice(1)];
    const kept = simplifyTrack(track);
    expect(kept).toEqual([0, 10, 20]);
  });

  it('removes zigzags below epsilon (2 m amplitude, epsilon 3 m) but keeps larger ones', () => {
    const zig = (amp: number) => range(21).map((i) => pt(i % 2 === 0 ? 0 : amp, i * 5));
    expect(simplifyTrack(zig(2))).toEqual([0, 20]);
    expect(simplifyTrack(zig(8)).length).toBeGreaterThan(2);
  });

  it('with epsilon 0 drops only points exactly on a straight line', () => {
    const track = [pt(0, 0), pt(0, 10), pt(0, 20), pt(5, 30), pt(0, 40)];
    expect(simplifyTrack(track, { epsilonM: 0 })).toEqual([0, 2, 3, 4]);
  });

  it('caps the number of vertices, keeping endpoints and the most important points', () => {
    // 41 points: a big spike at index 20 (50 m), small wiggles elsewhere (4 m).
    const track = range(41).map((i) => pt(i === 20 ? 50 : i % 2 === 0 ? 0 : 4, i * 5));
    const kept = simplifyTrack(track, { epsilonM: 0, maxVertices: 3 });
    expect(kept).toEqual([0, 20, 40]);
  });

  it('returns strictly increasing indices that include both endpoints', () => {
    const track = range(300).map((i) => pt(Math.sin(i / 7) * 30, i * 3));
    const kept = simplifyTrack(track);
    expect(at(kept, 0)).toBe(0);
    expect(at(kept, kept.length - 1)).toBe(299);
    for (let i = 1; i < kept.length; i++) {
      expect(at(kept, i)).toBeGreaterThan(at(kept, i - 1));
    }
  });

  it('never returns more than 1500 vertices by default, even for 20000 points', () => {
    let x = 0;
    let y = 0;
    const walk = range(20000).map((i) => {
      x += Math.cos(i * 0.37) * 4 + Math.sin(i * 1.3);
      y += Math.sin(i * 0.21) * 4 + Math.cos(i * 2.1);
      return pt(y, x);
    });
    const kept = simplifyTrack(walk);
    expect(kept.length).toBeLessThanOrEqual(1500);
    expect(kept.length).toBeGreaterThan(100);
  });

  it('rejects invalid input and options with a RangeError', () => {
    expect(() => simplifyTrack([{ lat: 91, lon: 0 }, pt(0, 0), pt(1, 1)])).toThrow(RangeError);
    expect(() => simplifyTrack([pt(0, 0), pt(1, 1), pt(2, 2)], { epsilonM: -1 })).toThrow(
      RangeError,
    );
    expect(() => simplifyTrack([pt(0, 0), pt(1, 1), pt(2, 2)], { epsilonM: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => simplifyTrack([pt(0, 0), pt(1, 1), pt(2, 2)], { maxVertices: 1 })).toThrow(
      RangeError,
    );
    expect(() => simplifyTrack([pt(0, 0), pt(1, 1), pt(2, 2)], { maxVertices: 2.5 })).toThrow(
      RangeError,
    );
  });
});

/** Random planar-ish walks in metres. */
const walkArb = fc
  .array(
    fc.tuple(
      fc.double({ min: -20, max: 20, noNaN: true }),
      fc.double({ min: -20, max: 20, noNaN: true }),
    ),
    { minLength: 0, maxLength: 120 },
  )
  .map((steps) => {
    let n = 0;
    let e = 0;
    return steps.map(([dn, de]) => {
      n += dn;
      e += de;
      return pt(n, e);
    });
  });

/** Same local projection the implementation documents (A-02), written independently here. */
function project(points: readonly { lat: number; lon: number }[]): [number, number][] {
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const meanLon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return points.map((p): [number, number] => [
    (p.lon - meanLon) * k * M_PER_DEG,
    (p.lat - meanLat) * M_PER_DEG,
  ]);
}

function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

describe('simplifyTrack properties', () => {
  it('guarantees every dropped point lies within epsilon of the simplified polyline', () => {
    fc.assert(
      fc.property(walkArb, fc.double({ min: 0, max: 15, noNaN: true }), (track, eps) => {
        fc.pre(track.length >= 3);
        const kept = simplifyTrack(track, { epsilonM: eps, maxVertices: 100000 });
        const xy = project(track);
        for (let i = 0; i < track.length; i++) {
          const p = at(xy, i);
          let best = Number.POSITIVE_INFINITY;
          for (let k = 1; k < kept.length; k++) {
            best = Math.min(best, distToSegment(p, at(xy, at(kept, k - 1)), at(xy, at(kept, k))));
          }
          expect(best).toBeLessThanOrEqual(eps + 1e-6);
        }
      }),
    );
  });

  it('is nested: a larger epsilon keeps a subset of what a smaller epsilon keeps', () => {
    fc.assert(
      fc.property(
        walkArb,
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (track, a, b) => {
          const [small, large] = a <= b ? [a, b] : [b, a];
          const keptSmall = new Set(simplifyTrack(track, { epsilonM: small, maxVertices: 100000 }));
          for (const i of simplifyTrack(track, { epsilonM: large, maxVertices: 100000 })) {
            expect(keptSmall.has(i)).toBe(true);
          }
        },
      ),
    );
  });

  it('respects maxVertices and always keeps both endpoints', () => {
    fc.assert(
      fc.property(walkArb, fc.integer({ min: 2, max: 40 }), (track, cap) => {
        fc.pre(track.length >= 2);
        const kept = simplifyTrack(track, { epsilonM: 0, maxVertices: cap });
        expect(kept.length).toBeLessThanOrEqual(cap);
        expect(at(kept, 0)).toBe(0);
        expect(at(kept, kept.length - 1)).toBe(track.length - 1);
      }),
    );
  });
});
