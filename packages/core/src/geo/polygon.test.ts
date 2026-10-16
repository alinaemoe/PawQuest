import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM, type LatLon } from './haversine';
import {
  MAX_RING_VERTICES,
  circleRing,
  distanceToRingM,
  isSimpleRing,
  pointInRing,
  ringAreaM2,
  ringBounds,
  ringCentroid,
  ringRadiusM,
  tidyRing,
} from './polygon';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);
const at = (x: number, y: number): LatLon => ({
  lat: 55 + y / M_PER_DEG,
  lon: 37 + x / (M_PER_DEG * COS),
});
const square = (size: number, x = 0, y = 0) => [
  at(x, y),
  at(x + size, y),
  at(x + size, y + size),
  at(x, y + size),
];

describe('area, centre and size', () => {
  it('a 100 m square is 10 000 m², whichever way it runs', () => {
    expect(ringAreaM2(square(100))).toBeGreaterThan(9990);
    expect(ringAreaM2(square(100))).toBeLessThan(10_010);
    expect(ringAreaM2([...square(100)].reverse())).toBeCloseTo(ringAreaM2(square(100)), 3);
  });

  it('fewer than three vertices enclose nothing', () => {
    expect(ringAreaM2([])).toBe(0);
    expect(ringAreaM2([at(0, 0), at(10, 0)])).toBe(0);
  });

  it('the centroid of a square is its middle, of an L it leans to the heavy side', () => {
    const c = ringCentroid(square(100));
    expect(haversineDistanceM(c, at(50, 50))).toBeLessThan(0.5);
    const ell = [at(0, 0), at(100, 0), at(100, 20), at(20, 20), at(20, 100), at(0, 100)];
    const l = ringCentroid(ell);
    expect(haversineDistanceM(l, at(50, 50))).toBeGreaterThan(5);
    // the centre of mass of a thin L lies in its notch, outside the ring: that is why the radius
    // of a contour is measured from it but nothing relies on it being inside
    expect(pointInRing(l, ell)).toBe(false);
  });

  it('a flat ring has its centre in the middle of its box', () => {
    const flat = [at(0, 0), at(50, 0), at(100, 0)];
    expect(haversineDistanceM(ringCentroid(flat), at(50, 0))).toBeLessThan(0.5);
  });

  it('the radius reaches the farthest corner and the box is right', () => {
    expect(ringRadiusM(square(100))).toBeGreaterThan(70);
    expect(ringRadiusM(square(100))).toBeLessThan(71.5);
    const b = ringBounds(square(100));
    expect(b.maxLat).toBeGreaterThan(b.minLat);
    expect(b.maxLon).toBeGreaterThan(b.minLon);
  });
});

describe('pointInRing and distanceToRingM', () => {
  const ell = [at(0, 0), at(100, 0), at(100, 20), at(20, 20), at(20, 100), at(0, 100)];

  it('inside, outside and in the notch of an L', () => {
    expect(pointInRing(at(10, 10), ell)).toBe(true);
    expect(pointInRing(at(10, 90), ell)).toBe(true);
    expect(pointInRing(at(80, 10), ell)).toBe(true);
    expect(pointInRing(at(80, 80), ell)).toBe(false);
    expect(pointInRing(at(-5, 50), ell)).toBe(false);
    expect(pointInRing(at(300, 300), ell)).toBe(false);
  });

  it('the distance to the nearest edge', () => {
    expect(distanceToRingM(at(50, 50), square(100))).toBeCloseTo(50, 0);
    expect(distanceToRingM(at(-30, 50), square(100))).toBeCloseTo(30, 0);
    expect(distanceToRingM(at(150, 150), square(100))).toBeCloseTo(Math.hypot(50, 50), 0);
  });
});

describe('isSimpleRing and tidyRing', () => {
  it('a bow tie is not simple', () => {
    expect(isSimpleRing([at(0, 0), at(100, 100), at(100, 0), at(0, 100)])).toBe(false);
    expect(isSimpleRing(square(100))).toBe(true);
  });

  it('drops a closing vertex and a vertex on top of another', () => {
    const ring = tidyRing([...square(100), at(0, 0), at(0.2, 0)]);
    expect(ring).toHaveLength(4);
    expect(tidyRing([at(0, 0), at(0, 0.3), ...square(100).slice(1)])).toHaveLength(4);
  });

  it('refuses what cannot be a contour', () => {
    expect(() => tidyRing([at(0, 0), at(50, 0)])).toThrow(RangeError);
    expect(() => tidyRing([at(0, 0), at(100, 100), at(100, 0), at(0, 100)])).toThrow(RangeError);
    expect(() => tidyRing(square(5))).toThrow(RangeError);
    expect(() => tidyRing([...square(100), { lat: 95, lon: 0 }])).toThrow(RangeError);
    expect(() => tidyRing([])).toThrow(RangeError);
  });

  it('thins a ring with too many vertices and keeps it a ring', () => {
    const many = circleRing(at(0, 0), 300, 1000);
    const ring = tidyRing(many);
    expect(ring.length).toBe(MAX_RING_VERTICES);
    expect(ringAreaM2(ring)).toBeGreaterThan(Math.PI * 300 * 300 * 0.98);
  });

  it('a ring of a hundred square meters just passes, one under it fails', () => {
    expect(() => tidyRing(square(10.1))).not.toThrow();
    expect(() => tidyRing(square(9.9))).toThrow(RangeError);
  });
});

describe('circleRing', () => {
  it('is a round contour of about the given size', () => {
    const ring = circleRing(at(0, 0), 100);
    expect(ring).toHaveLength(24);
    expect(ringAreaM2(ring)).toBeGreaterThan(Math.PI * 100 * 100 * 0.95);
    expect(ringAreaM2(ring)).toBeLessThan(Math.PI * 100 * 100);
    expect(pointInRing(at(0, 0), ring)).toBe(true);
    expect(ringRadiusM(ring)).toBeGreaterThan(99);
  });
});
