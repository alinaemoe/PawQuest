import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M } from '../geo/haversine';

import { DEFAULT_MOTION_CONFIG, analyzeMotion, pointSpeeds, type TimedPoint } from './motion';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const BASE_LAT = 55;
const BASE_LON = 37;

/** A point `northM` metres north of the base at `tSec` seconds. */
function p(tSec: number, northM: number, speedMps?: number): TimedPoint {
  const base = { ts: tSec * 1000, lat: BASE_LAT + northM / M_PER_DEG, lon: BASE_LON };
  return speedMps === undefined ? base : { ...base, speedMps };
}

/**
 * A 1 Hz track made of phases; each phase is [seconds, metres per second].
 * Speed 0 means standing still (all fixes at the same spot).
 */
function phased(phases: readonly (readonly [number, number])[], startS = 0): TimedPoint[] {
  const points: TimedPoint[] = [p(startS, 0)];
  let t = startS;
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

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${String(index)}`);
  }
  return item;
}

describe('DEFAULT_MOTION_CONFIG', () => {
  it('matches the spec values (A-03, A-25)', () => {
    expect(DEFAULT_MOTION_CONFIG).toEqual({
      movingSpeedMps: 0.4,
      minStopS: 10,
      longStopS: 180,
      gapAfterS: 30,
      maxPlausibleSpeedMps: 12,
    });
  });
});

describe('pointSpeeds', () => {
  it('returns an empty array for no points and 0 for a single point', () => {
    expect(pointSpeeds([])).toEqual([]);
    expect(pointSpeeds([p(0, 0)])).toEqual([0]);
  });

  it('derives a steady 1.4 m/s from positions when the device gives no speed', () => {
    for (const v of pointSpeeds(phased([[20, 1.4]]))) {
      expect(v).toBeCloseTo(1.4, 3);
    }
  });

  it('prefers a valid device speed over the derived one', () => {
    const track = [p(0, 0, 2), p(1, 1.4, 2), p(2, 2.8, 2), p(3, 4.2, 2), p(4, 5.6, 2)];
    for (const v of pointSpeeds(track)) {
      expect(v).toBeCloseTo(2, 9);
    }
  });

  it.each([Number.NaN, -1, 12.5, Number.POSITIVE_INFINITY])(
    'falls back to the derived speed when the device speed is %s',
    (bad) => {
      const track = [0, 1, 2, 3, 4].map((i) => p(i, i * 1.4, bad));
      for (const v of pointSpeeds(track)) {
        expect(v).toBeCloseTo(1.4, 3);
      }
    },
  );

  it('suppresses a single speed spike with the median', () => {
    const track = [p(0, 0), p(1, 1), p(2, 2), p(3, 3), p(4, 13.5), p(5, 14.5), p(6, 15.5)];
    // interval speeds: 1,1,1,10.5,1,1 -> the spike at the point between sits in a 5-wide window
    const speeds = pointSpeeds(track);
    expect(Math.max(...speeds)).toBeLessThan(2);
  });

  it('ignores the straight-line speed across a gap and uses the neighbouring interval', () => {
    const track = [p(0, 0), p(1, 1.4), p(2, 2.8), p(62, 100), p(63, 101.4), p(64, 102.8)];
    for (const v of pointSpeeds(track)) {
      expect(v).toBeCloseTo(1.4, 3);
    }
  });

  it('rejects unsorted timestamps and invalid coordinates with a RangeError', () => {
    expect(() => pointSpeeds([p(1, 0), p(1, 1)])).toThrow(RangeError);
    expect(() => pointSpeeds([p(2, 0), p(1, 1)])).toThrow(RangeError);
    expect(() => pointSpeeds([{ ts: 0, lat: 91, lon: 0 }, p(1, 0)])).toThrow(RangeError);
  });
});

describe('analyzeMotion', () => {
  it('returns zeros for fewer than two points', () => {
    const zero = { movingS: 0, stoppedS: 0, pausedS: 0, gapS: 0, totalS: 0, stops: [] };
    expect(analyzeMotion([])).toEqual(zero);
    expect(analyzeMotion([p(0, 0)])).toEqual(zero);
  });

  it('counts a steady walk entirely as moving', () => {
    const r = analyzeMotion(phased([[60, 1.4]]));
    expect(r.movingS).toBeCloseTo(60, 6);
    expect(r.stoppedS).toBe(0);
    expect(r.stops).toEqual([]);
  });

  it('splits walk, stand, walk into moving and one stop (within 3 s of smoothing blur)', () => {
    const r = analyzeMotion(
      phased([
        [30, 1.4],
        [30, 0],
        [30, 1.4],
      ]),
    );
    expect(r.totalS).toBe(90);
    expect(r.movingS).toBeGreaterThan(60 - 3);
    expect(r.movingS).toBeLessThan(60 + 3);
    expect(r.stops).toHaveLength(1);
    const stop = at(r.stops, 0);
    expect(stop.durationS).toBeGreaterThan(30 - 3);
    expect(stop.durationS).toBeLessThan(30 + 3);
    expect(stop.isLongStop).toBe(false);
  });

  it('absorbs a short slow-down (about 6 s) into movement', () => {
    const r = analyzeMotion(
      phased([
        [30, 1.4],
        [6, 0],
        [30, 1.4],
      ]),
    );
    expect(r.stops).toEqual([]);
    expect(r.stoppedS).toBe(0);
    expect(r.movingS).toBeCloseTo(66, 6);
  });

  it('places the stop at the standing position', () => {
    const r = analyzeMotion(
      phased([
        [20, 1.4],
        [30, 0],
        [20, 1.4],
      ]),
    );
    const stop = at(r.stops, 0);
    const expectedLat = BASE_LAT + (20 * 1.4) / M_PER_DEG;
    expect(stop.lat).toBeCloseTo(expectedLat, 6);
    expect(stop.lon).toBeCloseTo(BASE_LON, 9);
  });

  it('flags only stops longer than 3 minutes as long', () => {
    const short = analyzeMotion(
      phased([
        [20, 1.4],
        [150, 0],
        [20, 1.4],
      ]),
    );
    const long = analyzeMotion(
      phased([
        [20, 1.4],
        [200, 0],
        [20, 1.4],
      ]),
    );
    expect(at(short.stops, 0).isLongStop).toBe(false);
    expect(at(long.stops, 0).isLongStop).toBe(true);
  });

  it('reports a gap between accepted points as gap time, not movement or stop', () => {
    const track = [p(0, 0), p(1, 1.4), p(2, 2.8), p(62, 90), p(63, 91.4), p(64, 92.8)];
    const r = analyzeMotion(track);
    expect(r.gapS).toBe(60);
    expect(r.movingS).toBeCloseTo(4, 6);
    expect(r.stoppedS).toBe(0);
    expect(r.totalS).toBe(64);
  });

  it('moves manual pause time out of the other classes', () => {
    const r = analyzeMotion(phased([[60, 1.4]]), {
      pausedIntervals: [{ fromTs: 10_000, toTs: 25_000 }],
    });
    expect(r.pausedS).toBeCloseTo(15, 6);
    expect(r.movingS).toBeCloseTo(45, 6);
  });

  it('merges overlapping pauses, ignores invalid ones and clips to the track', () => {
    const r = analyzeMotion(phased([[60, 1.4]]), {
      pausedIntervals: [
        { fromTs: -5000, toTs: 5_000 }, // clipped to 0..5 s
        { fromTs: 4_000, toTs: 8_000 }, // overlaps the previous one
        { fromTs: 30_000, toTs: 30_000 }, // empty, ignored
        { fromTs: Number.NaN, toTs: 40_000 }, // invalid, ignored
        { fromTs: 55_000, toTs: 90_000 }, // clipped to 55..60 s
      ],
    });
    expect(r.pausedS).toBeCloseTo(8 + 5, 6);
    expect(r.movingS).toBeCloseTo(60 - 13, 6);
  });

  it('a manual pause splits a slow series, so each part is judged on its own length', () => {
    // 14 s standing, paused in the middle: two 7 s pieces, each below the 10 s stop limit.
    const track = phased([
      [10, 1.4],
      [14, 0],
      [10, 1.4],
    ]);
    const r = analyzeMotion(track, { pausedIntervals: [{ fromTs: 17_000, toTs: 17_500 }] });
    expect(r.stops).toEqual([]);
  });

  it('honours a custom configuration', () => {
    const track = phased([
      [20, 1.4],
      [8, 0],
      [20, 1.4],
    ]);
    const strict = { ...DEFAULT_MOTION_CONFIG, minStopS: 3 };
    expect(analyzeMotion(track, { config: strict }).stops).toHaveLength(1);
    expect(analyzeMotion(track).stops).toHaveLength(0);
  });

  it('rejects unsorted timestamps with a RangeError', () => {
    expect(() => analyzeMotion([p(5, 0), p(3, 1)])).toThrow(RangeError);
  });

  it('property: the four classes always add up to the time between first and last point', () => {
    const trackArb = fc
      .array(
        fc.tuple(
          fc.double({ min: 0.5, max: 45, noNaN: true }),
          fc.double({ min: 0, max: 8, noNaN: true }),
        ),
        { minLength: 2, maxLength: 60 },
      )
      .map((steps) => {
        let t = 0;
        let north = 0;
        return steps.map(([dt, step]) => {
          t += dt;
          north += step;
          return p(t, north);
        });
      });
    const pausesArb = fc.array(
      fc.tuple(
        fc.double({ min: -10, max: 600, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
      ),
      { maxLength: 5 },
    );
    fc.assert(
      fc.property(trackArb, pausesArb, (track, pauses) => {
        const r = analyzeMotion(track, {
          pausedIntervals: pauses.map(([from, len]) => ({
            fromTs: from * 1000,
            toTs: (from + len) * 1000,
          })),
        });
        const total = (at(track, track.length - 1).ts - at(track, 0).ts) / 1000;
        expect(r.movingS + r.stoppedS + r.pausedS + r.gapS).toBeCloseTo(total, 6);
        expect(r.movingS).toBeGreaterThanOrEqual(0);
        expect(r.stoppedS).toBeGreaterThanOrEqual(0);
        expect(r.pausedS).toBeGreaterThanOrEqual(0);
        expect(r.gapS).toBeGreaterThanOrEqual(0);
        for (const s of r.stops) {
          expect(s.durationS).toBeGreaterThan(0);
        }
      }),
    );
  });
});
