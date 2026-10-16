import { describe, expect, it } from 'vitest';

import type { TimedPoint } from './motion';
import {
  speedAt,
  speedProfile,
  speedZoneOf,
  zoneShare,
  ZONE_FROM_MPS,
  type SpeedProfile,
} from './speedProfile';

const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);

/** One point per second; `speed(i)` is the device speed at second `i`. */
function track(
  seconds: number,
  speed: (i: number) => number,
  skip: (i: number) => boolean = () => false,
) {
  const points: TimedPoint[] = [];
  for (let i = 0; i <= seconds; i += 1) {
    if (!skip(i)) {
      points.push({ lat: 55 + i * 1e-5, lon: 37, ts: T0 + i * 1000, speedMps: speed(i) });
    }
  }
  return points;
}

const need = (p: SpeedProfile | null): SpeedProfile => {
  if (p === null) {
    throw new Error('no profile');
  }
  return p;
};

describe('speedZoneOf', () => {
  it('takes the zone by the lower bounds', () => {
    expect(speedZoneOf(0)).toBe('standing');
    expect(speedZoneOf(0.29)).toBe('standing');
    expect(speedZoneOf(ZONE_FROM_MPS.slow)).toBe('slow');
    expect(speedZoneOf(0.8)).toBe('walk');
    expect(speedZoneOf(1.59)).toBe('walk');
    expect(speedZoneOf(1.6)).toBe('fast');
    expect(speedZoneOf(2.79)).toBe('fast');
    expect(speedZoneOf(2.8)).toBe('run');
  });
});

describe('speedProfile', () => {
  it('a constant speed is one zone, an even pace, no fast start', () => {
    const p = need(speedProfile(track(300, () => 1.2)));
    expect(p.zoneS.walk).toBeCloseTo(300, 6);
    expect(zoneShare(p, 'walk')).toBe(1);
    expect(zoneShare(p, 'run')).toBe(0);
    expect(p).toMatchObject({ pattern: 'even', fastStart: false, knownS: 300 });
    expect(p.phaseDelta).toBeCloseTo(0, 10);
    expect(p.medianMps).toBeCloseTo(1.2, 10);
    expect(p.windows).toHaveLength(10);
  });

  it('a stepped profile gives the right shares and a slower end', () => {
    // 120 s at 2.0 (fast), 120 s at 1.0 (walk), 60 s at 0.1 (standing)
    const p = need(speedProfile(track(300, (i) => (i < 120 ? 2 : i < 240 ? 1 : 0.1))));
    expect(zoneShare(p, 'fast')).toBeGreaterThan(0.38);
    expect(zoneShare(p, 'fast')).toBeLessThan(0.42);
    expect(zoneShare(p, 'standing')).toBeGreaterThan(0.18);
    expect(p.pattern).toBe('slower_end');
    expect(p.phaseDelta).toBeLessThan(-0.15);
    expect(p.fastStart).toBe(true);
  });

  it('a faster end is told as such', () => {
    const p = need(speedProfile(track(300, (i) => (i < 100 ? 0.9 : i < 200 ? 1.2 : 1.8))));
    expect(p.pattern).toBe('faster_end');
    expect(p.fastStart).toBe(false);
  });

  it('manual pauses and gaps are in no zone', () => {
    const paused = [{ fromTs: T0 + 100_000, toTs: T0 + 160_000 }];
    const p = need(
      speedProfile(
        track(300, () => 1.2),
        { pausedRanges: paused },
      ),
    );
    expect(p.knownS).toBeCloseTo(240, 6);
    const gap = need(
      speedProfile(
        track(
          300,
          () => 1.2,
          (i) => i > 100 && i < 200,
        ),
      ),
    );
    expect(gap.knownS).toBeCloseTo(200, 6); // the 100 s interval across the gap is dropped
  });

  it('a track with no usable interval has no profile; a zero first third has no change', () => {
    expect(speedProfile([])).toBeNull();
    expect(speedProfile(track(0, () => 1))).toBeNull();
    const still = need(speedProfile(track(90, (i) => (i < 30 ? 0 : 1.2))));
    expect(still.phaseDelta).toBeNull();
    expect(still.pattern).toBe('even');
  });
});

describe('speedAt', () => {
  const profile = need(
    speedProfile(
      track(300, (i) => (i < 150 ? 1 : 2)),
      {
        pausedRanges: [{ fromTs: T0 + 200_000, toTs: T0 + 260_000 }],
      },
    ),
  );

  it('the speed around a moment, null where nothing is near (a pause)', () => {
    expect(speedAt(profile, T0 + 50_000)).toBeCloseTo(1, 6);
    expect(speedAt(profile, T0 + 280_000)).toBeCloseTo(2, 6);
    expect(speedAt(profile, T0 + 230_000)).toBeNull();
  });
});
