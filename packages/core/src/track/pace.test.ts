import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M } from '../geo/haversine';

import type { TimedPoint } from './motion';
import {
  MIN_PACE_DISTANCE_M,
  averagePaceMinPerKm,
  currentSpeedMps,
  paceFromSpeedMinPerKm,
} from './pace';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;

function p(tSec: number, northM: number): TimedPoint {
  return { ts: tSec * 1000, lat: 55 + northM / M_PER_DEG, lon: 37 };
}

/** 1 Hz track; each phase is [seconds, metres per second]. */
function phased(phases: readonly (readonly [number, number])[]): TimedPoint[] {
  const points = [p(0, 0)];
  let t = 0;
  let north = 0;
  for (const [seconds, speed] of phases) {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      north += speed;
      points.push(p(t, north));
    }
  }
  return points;
}

describe('averagePaceMinPerKm', () => {
  it('converts moving time and distance to minutes per kilometre', () => {
    expect(averagePaceMinPerKm(600, 1000)).toBeCloseTo(10, 9); // 600 s per km
    expect(averagePaceMinPerKm(1200, 2000)).toBeCloseTo(10, 9);
    expect(averagePaceMinPerKm(1800, 3000)).toBeCloseTo(10, 9);
  });

  it('is undefined (null) below 200 m and exactly at the limit it is defined', () => {
    expect(MIN_PACE_DISTANCE_M).toBe(200);
    expect(averagePaceMinPerKm(120, 199.99)).toBeNull();
    expect(averagePaceMinPerKm(120, 200)).toBeCloseTo(10, 9);
  });

  it('is undefined (null) when there is no moving time', () => {
    expect(averagePaceMinPerKm(0, 500)).toBeNull();
  });

  it.each([
    [Number.NaN, 500],
    [60, Number.NaN],
    [-1, 500],
    [60, -1],
    [Number.POSITIVE_INFINITY, 500],
  ])('rejects invalid input (movingS=%s, distanceM=%s) with a RangeError', (s, d) => {
    expect(() => averagePaceMinPerKm(s, d)).toThrow(RangeError);
  });
});

describe('paceFromSpeedMinPerKm', () => {
  it('converts speed in m/s to minutes per kilometre', () => {
    expect(paceFromSpeedMinPerKm(1)).toBeCloseTo(1000 / 60, 9);
    expect(paceFromSpeedMinPerKm(1000 / 60 / 10)).toBeCloseTo(10, 9);
  });

  it('is undefined below the standing threshold (0.4 m/s by default)', () => {
    expect(paceFromSpeedMinPerKm(0.39)).toBeNull();
    expect(paceFromSpeedMinPerKm(0.4)).not.toBeNull();
    expect(paceFromSpeedMinPerKm(0.39, 0.3)).not.toBeNull();
  });

  it('rejects non-finite or negative speeds', () => {
    expect(() => paceFromSpeedMinPerKm(Number.NaN)).toThrow(RangeError);
    expect(() => paceFromSpeedMinPerKm(-1)).toThrow(RangeError);
  });
});

describe('currentSpeedMps', () => {
  it('returns null for no points or when no point falls into the window', () => {
    expect(currentSpeedMps([], 1000)).toBeNull();
    expect(currentSpeedMps(phased([[20, 1.4]]), 100_000)).toBeNull();
    expect(currentSpeedMps(phased([[20, 1.4]]), -5000)).toBeNull();
  });

  it('returns a steady walking speed', () => {
    const track = phased([[60, 1.4]]);
    expect(currentSpeedMps(track, 60_000)).toBeCloseTo(1.4, 3);
  });

  it('looks only at the last 30 seconds', () => {
    const track = phased([
      [40, 3],
      [40, 1],
    ]);
    expect(currentSpeedMps(track, 80_000)).toBeCloseTo(1, 3);
    expect(currentSpeedMps(track, 40_000)).toBeCloseTo(3, 3);
  });

  it('uses the half-open window (now - 30 s, now]', () => {
    // Speeds: first 30 s at 4 m/s, then 1 m/s. At now = 60 s the window is (30 s, 60 s].
    const track = phased([
      [30, 4],
      [30, 1],
    ]);
    expect(currentSpeedMps(track, 60_000)).toBeCloseTo(1, 3);
    expect(currentSpeedMps(track, 60_000, 60)).toBeGreaterThan(1.4); // wider window sees both phases
  });
});
