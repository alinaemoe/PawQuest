import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M } from '../geo/haversine';

import type { TimedPoint } from './motion';
import { findRides, rideSecondsWithin } from './rides';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

/** A straight track north at the given speeds: each piece is [seconds, m/s]. */
function track(pieces: readonly (readonly [number, number])[], step = 5): TimedPoint[] {
  const points: TimedPoint[] = [{ lat: 55, lon: 37, ts: T0 }];
  let y = 0;
  let t = T0;
  for (const [seconds, speed] of pieces) {
    for (let s = step; s <= seconds; s += step) {
      t += step * 1000;
      y += speed * step;
      points.push({ lat: 55 + y / M_PER_DEG, lon: 37, ts: t });
    }
  }
  return points;
}

describe('findRides', () => {
  it('a walk has no rides', () => {
    expect(findRides(track([[1800, 1.3]]))).toEqual([]);
  });

  it('a car trip in the middle of a walk is one ride with its distance (S-9)', () => {
    const points = track([
      [600, 1.3],
      [1500, 10],
      [300, 1.3],
    ]);
    const rides = findRides(points);
    expect(rides).toHaveLength(1);
    const ride = rides[0];
    expect(ride?.fromTs).toBe(T0 + 600_000);
    expect(ride?.durationS).toBeGreaterThan(1490);
    expect(ride?.durationS).toBeLessThan(1520);
    expect(ride?.distanceM).toBeGreaterThan(14_800);
    expect(ride?.distanceM).toBeLessThan(15_200);
  });

  it('a short dash is not a ride: 20 s at 4 m/s', () => {
    expect(
      findRides(
        track([
          [600, 1.3],
          [20, 4],
          [600, 1.3],
        ]),
      ),
    ).toEqual([]);
  });

  it('bursts of GPS noise in a slow walk do not chain into a ride', () => {
    const pieces: (readonly [number, number])[] = [];
    for (let i = 0; i < 8; i += 1) {
      pieces.push([5, 5], [35, 0.5]);
    }
    expect(findRides(track(pieces))).toEqual([]);
  });

  it('a jog is not a ride but a bike is', () => {
    expect(findRides(track([[600, 2.6]]))).toEqual([]);
    expect(findRides(track([[600, 5]]))).toHaveLength(1);
  });

  it('a red light does not end a ride, a long stop does', () => {
    const light = findRides(
      track([
        [300, 12],
        [45, 0],
        [300, 12],
      ]),
    );
    expect(light).toHaveLength(1);
    const long = findRides(
      track([
        [300, 12],
        [200, 0],
        [300, 12],
      ]),
    );
    expect(long).toHaveLength(2);
  });

  it('the ride ends where the fast movement ends, not after the following wait', () => {
    const points = track([
      [300, 12],
      [200, 0],
    ]);
    const rides = findRides(points);
    expect(rides).toHaveLength(1);
    expect(rides[0]?.toTs).toBe(T0 + 300_000);
  });

  it('a signal lost in a taxi still counts when the position jumped at ride speed', () => {
    const before = track([[300, 12]]);
    const last = before[before.length - 1];
    const after: TimedPoint[] = [];
    if (last !== undefined) {
      // 10 minutes of silence, 8 km covered
      after.push({ lat: last.lat + 8000 / M_PER_DEG, lon: 37, ts: last.ts + 600_000 });
    }
    const rides = findRides([...before, ...after]);
    expect(rides).toHaveLength(1);
    expect(rides[0]?.distanceM).toBeGreaterThan(11_000);
  });

  it('silence with no movement is not a ride', () => {
    const before = track([[600, 1.3]]);
    const last = before[before.length - 1];
    const after = last === undefined ? [] : [{ ...last, ts: last.ts + 1_200_000 }];
    expect(findRides([...before, ...after])).toEqual([]);
  });

  it('implausible speeds are glitches', () => {
    const points = [
      { lat: 55, lon: 37, ts: T0 },
      { lat: 56, lon: 37, ts: T0 + 1000 }, // 111 km in a second
      { lat: 56, lon: 37, ts: T0 + 2000 },
    ];
    expect(findRides(points)).toEqual([]);
  });

  it('copes with empty, single and unordered points', () => {
    expect(findRides([])).toEqual([]);
    expect(findRides([{ lat: 55, lon: 37, ts: T0 }])).toEqual([]);
    expect(
      findRides([
        { lat: 55, lon: 37, ts: T0 + 10_000 },
        { lat: 55.001, lon: 37, ts: T0 },
      ]),
    ).toEqual([]);
  });

  it('options change the thresholds', () => {
    const points = track([[600, 2.6]]);
    expect(findRides(points, { minSpeedMps: 2 })).toHaveLength(1);
    expect(findRides(track([[40, 12]]), { minDurationS: 30 })).toHaveLength(1);
    expect(findRides(track([[40, 12]]))).toEqual([]);
  });
});

describe('rideSecondsWithin', () => {
  const rides = [
    { fromTs: 1000, toTs: 5000, durationS: 4, distanceM: 0 },
    { fromTs: 8000, toTs: 9000, durationS: 1, distanceM: 0 },
  ];

  it('counts the overlap with every ride', () => {
    expect(rideSecondsWithin(rides, 0, 10_000)).toBe(5);
    expect(rideSecondsWithin(rides, 3000, 8500)).toBe(2.5);
    expect(rideSecondsWithin(rides, 5000, 8000)).toBe(0);
    expect(rideSecondsWithin([], 0, 10_000)).toBe(0);
  });
});
