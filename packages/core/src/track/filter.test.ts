import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM } from '../geo/haversine';

import {
  DEFAULT_TRACK_FILTER_CONFIG,
  applyFix,
  filterTrack,
  initialTrackFilterState,
  type GpsFix,
} from './filter';

const METRES_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;
const BASE_LAT = 55;
const BASE_LON = 37;

/** A fix `northM`/`eastM` metres from the base point at `tSec` seconds. */
function fix(tSec: number, northM: number, eastM = 0, accuracyM?: number): GpsFix {
  const lat = BASE_LAT + northM / METRES_PER_DEGREE;
  const lon = BASE_LON + eastM / (METRES_PER_DEGREE * Math.cos((BASE_LAT * Math.PI) / 180));
  return accuracyM === undefined
    ? { ts: tSec * 1000, lat, lon }
    : { ts: tSec * 1000, lat, lon, accuracyM };
}

/** Bounds-checked array access (noUncheckedIndexedAccess makes plain indexing `T | undefined`). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${String(index)}`);
  }
  return item;
}

describe('DEFAULT_TRACK_FILTER_CONFIG', () => {
  it('matches the values fixed by the spec (A-01)', () => {
    expect(DEFAULT_TRACK_FILTER_CONFIG).toEqual({
      maxAccuracyM: 30,
      maxPlausibleSpeedMps: 12,
      minStepM: 3,
      accuracyStepFactor: 0.5,
      gapAfterS: 30,
      // not in the original spec: added after a stale first fix swallowed a whole walk (D-59)
      reanchorAfterJumps: 5,
    });
  });
});

describe('applyFix', () => {
  it('accepts the first valid fix as the start with zero distance', () => {
    const { state, decision } = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5));
    expect(decision).toEqual({ kind: 'accepted', motion: 'start', distanceDeltaM: 0, gap: null });
    expect(state.distanceM).toBe(0);
    expect(state.lastAccepted).toEqual(fix(0, 0, 0, 5));
  });

  it('drops accuracy above 30 m but accepts exactly 30 m', () => {
    const s0 = initialTrackFilterState();
    expect(applyFix(s0, fix(0, 0, 0, 30.01)).decision).toEqual({
      kind: 'dropped',
      reason: 'poor_accuracy',
    });
    expect(applyFix(s0, fix(0, 0, 0, 30)).decision.kind).toBe('accepted');
  });

  it('accepts a fix that carries no accuracy at all', () => {
    expect(applyFix(initialTrackFilterState(), fix(0, 0)).decision.kind).toBe('accepted');
  });

  it.each([
    ['latitude out of range', { ts: 0, lat: 91, lon: 0 }],
    ['non-finite longitude', { ts: 0, lat: 0, lon: Number.NaN }],
    ['NaN timestamp', { ts: Number.NaN, lat: 0, lon: 0 }],
    ['infinite timestamp', { ts: Number.POSITIVE_INFINITY, lat: 0, lon: 0 }],
    ['negative accuracy', { ts: 0, lat: 0, lon: 0, accuracyM: -1 }],
    ['NaN accuracy', { ts: 0, lat: 0, lon: 0, accuracyM: Number.NaN }],
    ['infinite accuracy', { ts: 0, lat: 0, lon: 0, accuracyM: Number.POSITIVE_INFINITY }],
  ])('drops an invalid fix: %s', (_name, bad) => {
    expect(applyFix(initialTrackFilterState(), bad).decision).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    });
  });

  it('keeps the state empty after a dropped first fix, so the next valid fix becomes the start', () => {
    const afterDrop = applyFix(initialTrackFilterState(), fix(0, 0, 0, 99));
    expect(afterDrop.state).toEqual(initialTrackFilterState());
    const next = applyFix(afterDrop.state, fix(1, 0, 0, 5));
    expect(next.decision).toMatchObject({ kind: 'accepted', motion: 'start' });
  });

  it('drops equal and earlier timestamps without touching the state', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(10, 0, 0, 5)).state;
    for (const t of [10, 9, 0]) {
      const r = applyFix(s1, fix(t, 50, 0, 5));
      expect(r.decision).toEqual({ kind: 'dropped', reason: 'non_monotonic' });
      expect(r.state).toBe(s1);
    }
  });

  it('drops speed jumps strictly above 12 m/s and accepts just below', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state;
    expect(applyFix(s1, fix(1, 12.01, 0, 5)).decision).toEqual({
      kind: 'dropped',
      reason: 'speed_jump',
    });
    expect(applyFix(s1, fix(1, 11.99, 0, 5)).decision.kind).toBe('accepted');
  });

  it('accepts a speed of exactly the limit (only strictly faster is a jump)', () => {
    // Exact equality in floating point: use the computed distance itself as the speed limit.
    const first = fix(0, 0, 0, 5);
    const second = fix(1, 10, 0, 5);
    const exactSpeed = haversineDistanceM(first, second); // dt = 1 s
    const s1 = applyFix(initialTrackFilterState(), first).state;
    const atLimit = { ...DEFAULT_TRACK_FILTER_CONFIG, maxPlausibleSpeedMps: exactSpeed };
    expect(applyFix(s1, second, atLimit).decision.kind).toBe('accepted');
  });

  it('accepts a perfect accuracy of 0 m', () => {
    expect(applyFix(initialTrackFilterState(), fix(0, 0, 0, 0)).decision.kind).toBe('accepted');
  });

  it('counts a step exactly equal to the threshold as movement (only strictly smaller is drift)', () => {
    const first = fix(0, 0, 0, 5);
    const second = fix(5, 4, 0, 5);
    const exactStep = haversineDistanceM(first, second);
    const s1 = applyFix(initialTrackFilterState(), first).state;
    const atThreshold = { ...DEFAULT_TRACK_FILTER_CONFIG, minStepM: exactStep };
    expect(applyFix(s1, second, atThreshold).decision).toMatchObject({ motion: 'moving' });
  });

  it('judges the next fix against the last ACCEPTED fix after a dropped jump', () => {
    let state = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state;
    state = applyFix(state, fix(1, 500, 0, 5)).state; // teleport outlier: dropped
    const r = applyFix(state, fix(2, 5, 0, 5)); // 5 m from the accepted start in 2 s
    expect(r.decision).toMatchObject({ kind: 'accepted', motion: 'moving' });
    expect(r.state.distanceM).toBeCloseTo(5, 3);
  });

  it('treats a step below max(3 m, 0.5*accuracy) as stationary and adds no distance', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state;
    const r = applyFix(s1, fix(1, 2.9, 0, 5));
    expect(r.decision).toMatchObject({ kind: 'accepted', motion: 'stationary', distanceDeltaM: 0 });
    expect(r.state.distanceM).toBe(0);
  });

  it('scales the stationary threshold with accuracy: 20 m accuracy means 10 m', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(0, 0, 0, 20)).state;
    expect(applyFix(s1, fix(5, 9.9, 0, 20)).decision).toMatchObject({ motion: 'stationary' });
    expect(applyFix(s1, fix(5, 10.1, 0, 20)).decision).toMatchObject({ motion: 'moving' });
  });

  it('does not move the anchor on stationary fixes, so a slow real walk still accumulates (84 m)', () => {
    // 1.4 m/s sampled at 1 Hz: every step is 1.4 m, below the 3 m threshold. A filter that
    // compared with the previous accepted point would count 0 m here (verified: spec defect D-46).
    let state = initialTrackFilterState();
    for (let i = 0; i <= 60; i++) {
      state = applyFix(state, fix(i, 1.4 * i, 0, 5)).state;
    }
    expect(state.distanceM).toBeGreaterThan(84 - 3);
    expect(state.distanceM).toBeLessThanOrEqual(84 + 1e-6);
  });

  it('ignores GPS drift on a standing dog: 2 m of jitter for 10 minutes adds no distance', () => {
    let state = initialTrackFilterState();
    for (let i = 0; i <= 600; i++) {
      const jitter = i % 2 === 0 ? 0 : 2; // always within 3 m of the anchor
      state = applyFix(state, fix(i, jitter, 0, 5)).state;
    }
    expect(state.distanceM).toBe(0);
  });

  it('reports a gap only when dt is strictly above 30 s', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state;
    const atThirty = applyFix(s1, fix(30, 10, 0, 5)).decision;
    expect(atThirty).toMatchObject({ kind: 'accepted', gap: null });
    const atThirtyOne = applyFix(s1, fix(31, 10, 0, 5)).decision;
    expect(atThirtyOne).toMatchObject({ kind: 'accepted', gap: { fromTs: 0, toTs: 31000 } });
  });

  it('still counts distance across a gap, as a straight line from the anchor', () => {
    const s1 = applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state;
    const r = applyFix(s1, fix(60, 40, 0, 5));
    expect(r.decision).toMatchObject({ motion: 'moving' });
    expect(r.state.distanceM).toBeCloseTo(40, 3);
  });

  it('is pure: it works on frozen inputs and returns a new state object', () => {
    const s1 = Object.freeze(applyFix(initialTrackFilterState(), fix(0, 0, 0, 5)).state);
    const f = Object.freeze(fix(5, 20, 0, 5)); // 4 m/s: plausible, so it is accepted
    const r = applyFix(s1, f);
    expect(r.decision).toMatchObject({ kind: 'accepted', motion: 'moving' });
    expect(r.state).not.toBe(s1);
    expect(s1.distanceM).toBe(0);
  });

  it('honours a custom configuration', () => {
    const s0 = initialTrackFilterState();
    const strict = { ...DEFAULT_TRACK_FILTER_CONFIG, maxAccuracyM: 10 };
    expect(applyFix(s0, fix(0, 0, 0, 15), strict).decision).toMatchObject({
      reason: 'poor_accuracy',
    });
    expect(applyFix(s0, fix(0, 0, 0, 15)).decision.kind).toBe('accepted');
  });
});

describe('filterTrack', () => {
  it('returns empty results for an empty input', () => {
    expect(filterTrack([])).toEqual({ points: [], distanceM: 0, gaps: [], dropped: [] });
  });

  it('aggregates accepted points, distance, gaps and dropped indices', () => {
    const fixes = [
      fix(0, 0, 0, 5), // 0 start
      fix(5, 20, 0, 5), // 1 moving 20 m
      fix(6, 20.5, 0, 99), // 2 dropped: poor accuracy
      fix(5, 30, 0, 5), // 3 dropped: non-monotonic (ts == last accepted)
      fix(7, 400, 0, 5), // 4 dropped: speed jump
      fix(50, 60, 0, 5), // 5 moving 40 m after a 45 s gap
    ];
    const result = filterTrack(fixes);
    expect(result.points).toEqual([at(fixes, 0), at(fixes, 1), at(fixes, 5)]);
    expect(result.distanceM).toBeCloseTo(60, 3);
    expect(result.gaps).toEqual([{ fromTs: 5000, toTs: 50000 }]);
    expect(result.dropped).toEqual([
      { index: 2, reason: 'poor_accuracy' },
      { index: 3, reason: 'non_monotonic' },
      { index: 4, reason: 'speed_jump' },
    ]);
  });

  it('keeps stationary fixes in the track but not in the distance', () => {
    const fixes = [fix(0, 0, 0, 5), fix(1, 1, 0, 5), fix(2, 1.5, 0, 5)];
    const result = filterTrack(fixes);
    expect(result.points).toHaveLength(3);
    expect(result.distanceM).toBe(0);
  });
});

/** Random plausible-ish GPS streams, including time going backwards and bad accuracy. */
const streamArb = fc
  .array(
    fc.record({
      dtS: fc.double({ min: -5, max: 70, noNaN: true }),
      northM: fc.double({ min: -60, max: 60, noNaN: true }),
      eastM: fc.double({ min: -60, max: 60, noNaN: true }),
      accuracyM: fc.option(fc.double({ min: 0, max: 80, noNaN: true }), { nil: undefined }),
    }),
    { maxLength: 80 },
  )
  .map((steps) => {
    let t = 1_000_000;
    let north = 0;
    let east = 0;
    return steps.map((s) => {
      t += s.dtS;
      north += s.northM;
      east += s.eastM;
      return fix(t, north, east, s.accuracyM);
    });
  });

describe('filterTrack properties', () => {
  it('is idempotent: filtering its own accepted points changes nothing', () => {
    fc.assert(
      fc.property(streamArb, (fixes) => {
        const first = filterTrack(fixes);
        const second = filterTrack(first.points);
        expect(second.points).toEqual(first.points);
        expect(second.distanceM).toBeCloseTo(first.distanceM, 9);
        expect(second.gaps).toEqual(first.gaps);
        expect(second.dropped).toEqual([]);
      }),
    );
  });

  it('accepts strictly increasing timestamps only and never reports negative distance', () => {
    fc.assert(
      fc.property(streamArb, (fixes) => {
        const { points, distanceM } = filterTrack(fixes);
        expect(distanceM).toBeGreaterThanOrEqual(0);
        for (let i = 1; i < points.length; i++) {
          expect(at(points, i).ts).toBeGreaterThan(at(points, i - 1).ts);
        }
      }),
    );
  });

  it('never counts more distance than the polyline through the accepted points', () => {
    fc.assert(
      fc.property(streamArb, (fixes) => {
        const { points, distanceM } = filterTrack(fixes);
        let polyline = 0;
        for (let i = 1; i < points.length; i++) {
          polyline += haversineDistanceM(at(points, i - 1), at(points, i));
        }
        expect(distanceM).toBeLessThanOrEqual(polyline + 1e-6);
      }),
    );
  });

  it('accounts for every input fix exactly once (accepted + dropped = input length)', () => {
    fc.assert(
      fc.property(streamArb, (fixes) => {
        const { points, dropped } = filterTrack(fixes);
        expect(points.length + dropped.length).toBe(fixes.length);
      }),
    );
  });
});

describe('filterTrack: a stale first fix (D-59)', () => {
  const M_PER_DEG = 111_195;
  const north = (second: number, lat0 = 55.7558): GpsFix => ({
    ts: second * 1000,
    lat: lat0 + (1.4 * second) / M_PER_DEG,
    lon: 37.6173,
    accuracyM: 5,
  });
  const stale: GpsFix = { ts: 0, lat: 37.4219, lon: -122.084, accuracyM: 5 }; // far away

  it('restarts the track after five agreeing fixes instead of dropping the whole walk', () => {
    const walk = Array.from({ length: 40 }, (_, i) => north(i + 1));
    const result = filterTrack([stale, ...walk]);
    // the stale point plus the fixes that were dropped before the restart
    expect(result.dropped.map((d) => d.reason)).toEqual(Array(4).fill('speed_jump'));
    expect(result.points[0]).toBe(stale);
    expect(result.points[1]).toBe(walk[4]);
    // distance is the real walk after the restart (~35 fixes at 1.4 m/s), nothing from the jump
    expect(result.distanceM).toBeGreaterThan(40);
    expect(result.distanceM).toBeLessThan(55);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.fromTs).toBe(0);
  });

  it('a single glitch in the middle of a walk is still just dropped', () => {
    const walk = Array.from({ length: 20 }, (_, i) => north(i));
    const glitch: GpsFix = { ts: 10_500, lat: 56.5, lon: 38, accuracyM: 5 };
    const result = filterTrack([...walk.slice(0, 11), glitch, ...walk.slice(11)]);
    expect(result.dropped).toEqual([{ index: 11, reason: 'speed_jump' }]);
    expect(result.points).toHaveLength(20);
  });

  it('fixes that jump around without agreeing never restart the track', () => {
    const start = north(0);
    const wild = Array.from({ length: 12 }, (_, i): GpsFix => ({
      ts: (i + 1) * 1000,
      lat: 40 + (i % 2) * 5,
      lon: 10 + i * 7,
      accuracyM: 5,
    }));
    const result = filterTrack([start, ...wild]);
    expect(result.points).toEqual([start]);
    expect(result.dropped).toHaveLength(12);
  });

  it('the restart happens exactly at the configured streak', () => {
    const walk = Array.from({ length: 10 }, (_, i) => north(i + 1));
    const two = filterTrack([stale, ...walk], {
      ...DEFAULT_TRACK_FILTER_CONFIG,
      reanchorAfterJumps: 2,
    });
    expect(two.points[1]).toBe(walk[1]);
    const never = filterTrack([stale, ...walk.slice(0, 4)]);
    expect(never.points).toEqual([stale]);
  });
});
