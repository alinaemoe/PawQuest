import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM } from './haversine';

/** Metres per degree along a great circle on the spec sphere: R * pi / 180. */
const METRES_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

const latArb = fc.double({ min: -90, max: 90, noNaN: true });
const lonArb = fc.double({ min: -180, max: 180, noNaN: true });
const pointArb = fc.record({ lat: latArb, lon: lonArb });

/** Independent oracle: spherical law of cosines (a different formula from haversine). */
function lawOfCosinesM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const cosC =
    Math.sin(a.lat * toRad) * Math.sin(b.lat * toRad) +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  return EARTH_RADIUS_M * Math.acos(Math.min(1, Math.max(-1, cosC)));
}

describe('EARTH_RADIUS_M', () => {
  it('is the mean Earth radius fixed by the spec (A-01)', () => {
    expect(EARTH_RADIUS_M).toBe(6371008.8);
  });
});

describe('haversineDistanceM', () => {
  it('returns exactly 0 for identical points', () => {
    expect(haversineDistanceM({ lat: 55.75, lon: 37.62 }, { lat: 55.75, lon: 37.62 })).toBe(0);
  });

  it('measures one degree of latitude along a meridian as R*pi/180', () => {
    expect(haversineDistanceM({ lat: 10, lon: 20 }, { lat: 11, lon: 20 })).toBeCloseTo(
      METRES_PER_DEGREE,
      6,
    );
  });

  it('measures one degree of longitude on the equator as R*pi/180', () => {
    expect(haversineDistanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(
      METRES_PER_DEGREE,
      6,
    );
  });

  it('measures a pole-to-pole path as half the circumference', () => {
    expect(haversineDistanceM({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(
      EARTH_RADIUS_M * Math.PI,
      3,
    );
  });

  it('measures antipodal points as half the circumference', () => {
    const d = haversineDistanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(d).toBeCloseTo(EARTH_RADIUS_M * Math.PI, 3);
  });

  it('stays finite where the haversine term overshoots 1 by one ulp (verified input pair)', () => {
    // For this pair h = 1.0000000000000002 in IEEE-754 doubles (found by a sweep, not assumed).
    const d = haversineDistanceM(
      { lat: -66.59999999999991, lon: 0 },
      { lat: 66.59999999999991, lon: 180 },
    );
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(EARTH_RADIUS_M * Math.PI, 3);
  });

  it('treats the two poles as single points regardless of longitude', () => {
    expect(haversineDistanceM({ lat: 90, lon: 0 }, { lat: 90, lon: 123 })).toBeCloseTo(0, 6);
  });

  it('handles the antimeridian: 0.0002 degrees of longitude across 180 is about 22 m', () => {
    const d = haversineDistanceM({ lat: 0, lon: 179.9999 }, { lat: 0, lon: -179.9999 });
    expect(d).toBeCloseTo(0.0002 * METRES_PER_DEGREE, 4);
  });

  it('is accurate at dog-walk scale: a point 1 m due north is 1 m away', () => {
    const oneMetreInDegrees = 1 / METRES_PER_DEGREE;
    const d = haversineDistanceM(
      { lat: 55.75, lon: 37.62 },
      { lat: 55.75 + oneMetreInDegrees, lon: 37.62 },
    );
    expect(d).toBeCloseTo(1, 6);
  });

  it('agrees with a published city-pair distance (London to Paris, about 343.5 km)', () => {
    const d = haversineDistanceM({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
    expect(d / 1000).toBeGreaterThan(343);
    expect(d / 1000).toBeLessThan(344.5);
  });

  it('property: is symmetric and non-negative', () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const ab = haversineDistanceM(a, b);
        const ba = haversineDistanceM(b, a);
        expect(ab).toBeGreaterThanOrEqual(0);
        expect(ab).toBeCloseTo(ba, 6);
      }),
    );
  });

  it('property: never exceeds half the circumference and is never NaN', () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const d = haversineDistanceM(a, b);
        expect(Number.isNaN(d)).toBe(false);
        expect(d).toBeLessThanOrEqual(EARTH_RADIUS_M * Math.PI + 1e-6);
      }),
    );
  });

  it('property: satisfies the triangle inequality at walking scale (strict, 1 micrometre)', () => {
    // Points within about 0.25 degrees (~28 km) of a common base: the regime the app lives in.
    const offsetArb = fc.double({ min: -0.25, max: 0.25, noNaN: true });
    const localPointArb = fc
      .tuple(
        fc.double({ min: -80, max: 80, noNaN: true }),
        fc.double({ min: -170, max: 170, noNaN: true }),
        offsetArb,
        offsetArb,
      )
      .map(([lat, lon, dLat, dLon]) => ({ lat: lat + dLat, lon: lon + dLon }));
    fc.assert(
      fc.property(localPointArb, localPointArb, localPointArb, (a, b, c) => {
        const ac = haversineDistanceM(a, c);
        const abc = haversineDistanceM(a, b) + haversineDistanceM(b, c);
        expect(ac).toBeLessThanOrEqual(abc + 1e-6);
      }),
    );
  });

  it('property: satisfies the triangle inequality globally within 1 m (near-antipodal limit)', () => {
    // Near antipodes asin(sqrt(h)) is ill-conditioned: a 1 ulp error in h becomes ~0.1 m.
    // A counterexample of 1.1 cm was found by fast-check (seed -1475106914) and is why the
    // global tolerance is 1 m rather than 1 micrometre. Irrelevant for dog walks, documented here.
    fc.assert(
      fc.property(pointArb, pointArb, pointArb, (a, b, c) => {
        const ac = haversineDistanceM(a, c);
        const abc = haversineDistanceM(a, b) + haversineDistanceM(b, c);
        expect(ac).toBeLessThanOrEqual(abc + 1);
      }),
    );
  });

  it('regression: the near-antipodal triple that exposed the conditioning limit', () => {
    const a = { lat: 0, lon: -179.99999790869023 };
    const b = { lat: -6.037091348628667e-7, lon: 0 };
    const c = { lat: 0, lon: 0 };
    const excess = haversineDistanceM(a, c) - (haversineDistanceM(a, b) + haversineDistanceM(b, c));
    expect(excess).toBeLessThan(0.1); // observed: 0.0115 m over a 20,015 km path
  });

  it('property: matches the independent law-of-cosines oracle for distances above 1 km', () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const oracle = lawOfCosinesM(a, b);
        fc.pre(oracle > 1000 && oracle < EARTH_RADIUS_M * Math.PI - 1000);
        expect(haversineDistanceM(a, b)).toBeCloseTo(oracle, 0);
      }),
    );
  });

  it.each([
    ['latitude above 90', { lat: 90.0001, lon: 0 }],
    ['latitude below -90', { lat: -90.0001, lon: 0 }],
    ['longitude above 180', { lat: 0, lon: 180.0001 }],
    ['longitude below -180', { lat: 0, lon: -180.0001 }],
    ['NaN latitude', { lat: Number.NaN, lon: 0 }],
    ['NaN longitude', { lat: 0, lon: Number.NaN }],
    ['infinite latitude', { lat: Number.POSITIVE_INFINITY, lon: 0 }],
    ['infinite longitude', { lat: 0, lon: Number.NEGATIVE_INFINITY }],
  ])('rejects %s with a RangeError (first argument)', (_name, bad) => {
    expect(() => haversineDistanceM(bad, { lat: 0, lon: 0 })).toThrow(RangeError);
  });

  it('rejects an invalid second argument too', () => {
    expect(() => haversineDistanceM({ lat: 0, lon: 0 }, { lat: 100, lon: 0 })).toThrow(RangeError);
  });
});
