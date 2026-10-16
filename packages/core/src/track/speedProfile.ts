import { median } from '../util/median';

import {
  DEFAULT_MOTION_CONFIG,
  pointSpeeds,
  type MotionConfig,
  type TimedPoint,
  type TimeRange,
} from './motion';

/** The speed zones of a walk (spec A-25): the speed of the owner with the phone, in m/s. */
export const SPEED_ZONES = ['standing', 'slow', 'walk', 'fast', 'run'] as const;
export type SpeedZone = (typeof SPEED_ZONES)[number];

/** Lower bounds of the zones in m/s: standing below 0.3, then 0.8, 1.6 and 2.8. */
export const ZONE_FROM_MPS: Readonly<Record<SpeedZone, number>> = {
  standing: 0,
  slow: 0.3,
  walk: 0.8,
  fast: 1.6,
  run: 2.8,
};

export function speedZoneOf(mps: number): SpeedZone {
  if (mps >= ZONE_FROM_MPS.run) {
    return 'run';
  }
  if (mps >= ZONE_FROM_MPS.fast) {
    return 'fast';
  }
  if (mps >= ZONE_FROM_MPS.walk) {
    return 'walk';
  }
  if (mps >= ZONE_FROM_MPS.slow) {
    return 'slow';
  }
  return 'standing';
}

/** A zone is shown from this much time (10 s), shorter is dropped (A-25 step 3). */
export const MIN_ZONE_SHOWN_S = 10;
/** The length of a profile window (A-25 step 4). */
export const PROFILE_WINDOW_S = 30;
/** A change of the median between the last and the first third that counts (A-25 step 4). */
export const PHASE_CHANGE = 0.15;
/** The first fifth against the whole walk: "a fast start" (A-25 step 4). */
export const FAST_START_RATIO = 1.25;
/** The reach of "the speed at a moment" on both sides (A-25 step 5). */
export const SPEED_AT_REACH_S = 15;

export interface SpeedInterval {
  /** Middle of the interval. */
  readonly ts: number;
  readonly durationS: number;
  readonly mps: number;
}

export interface ProfileWindow {
  /** Middle of the window. */
  readonly ts: number;
  readonly mps: number;
}

export type PhasePattern = 'faster_end' | 'slower_end' | 'even';

export interface SpeedProfile {
  readonly intervals: readonly SpeedInterval[];
  /** Seconds in each zone; pauses and gaps are not in any zone. */
  readonly zoneS: Readonly<Record<SpeedZone, number>>;
  /** Their sum: the time the speed is known for. */
  readonly knownS: number;
  readonly windows: readonly ProfileWindow[];
  readonly medianMps: number;
  /** Median of the last third against the first (null when the first is zero). */
  readonly phaseDelta: number | null;
  readonly pattern: PhasePattern;
  readonly fastStart: boolean;
}

export interface SpeedProfileOptions {
  readonly pausedRanges?: readonly TimeRange[];
  readonly config?: Readonly<MotionConfig>;
}

const inside = (ranges: readonly TimeRange[], ts: number): boolean =>
  ranges.some((r) => ts >= r.fromTs && ts < r.toTs);

/**
 * Zones, windows and phases of the speed of a walk (A-25). The speed of an interval is the mean of
 * the smoothed speeds of its ends; an interval across a gap (longer than `gapAfterS`) or inside a
 * manual pause does not count. A track with no usable interval gives null.
 */
export function speedProfile(
  points: readonly TimedPoint[],
  options: SpeedProfileOptions = {},
): SpeedProfile | null {
  const config = options.config ?? DEFAULT_MOTION_CONFIG;
  const paused = options.pausedRanges ?? [];
  const speeds = pointSpeeds(points, config);
  const intervals: SpeedInterval[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const sa = speeds[i];
    const sb = speeds[i + 1];
    if (a === undefined || b === undefined || sa === undefined || sb === undefined) {
      continue;
    }
    const durationS = (b.ts - a.ts) / 1000;
    const mid = (a.ts + b.ts) / 2;
    if (durationS <= 0 || durationS > config.gapAfterS || inside(paused, mid)) {
      continue;
    }
    intervals.push({ ts: mid, durationS, mps: (sa + sb) / 2 });
  }
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }

  const zoneS: Record<SpeedZone, number> = { standing: 0, slow: 0, walk: 0, fast: 0, run: 0 };
  for (const interval of intervals) {
    zoneS[speedZoneOf(interval.mps)] += interval.durationS;
  }
  const knownS = intervals.reduce((sum, i) => sum + i.durationS, 0);

  const start = points[0]?.ts ?? first.ts;
  const end = points[points.length - 1]?.ts ?? last.ts;
  const windowMs = PROFILE_WINDOW_S * 1000;
  const byWindow = new Map<number, number[]>();
  for (const interval of intervals) {
    const index = Math.floor((interval.ts - start) / windowMs);
    byWindow.set(index, [...(byWindow.get(index) ?? []), interval.mps]);
  }
  const windows = [...byWindow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, values]): ProfileWindow => ({
      ts: start + index * windowMs + windowMs / 2,
      mps: median(values),
    }));

  const span = end - start;
  const between = (from: number, to: number): number[] =>
    intervals
      .filter((i) => i.ts >= start + span * from && i.ts <= start + span * to)
      .map((i) => i.mps);
  const firstThird = between(0, 1 / 3);
  const lastThird = between(2 / 3, 1);
  const medianMps = median(intervals.map((i) => i.mps));
  const firstMedian = firstThird.length === 0 ? 0 : median(firstThird);
  const lastMedian = lastThird.length === 0 ? 0 : median(lastThird);
  const phaseDelta = firstMedian > 0 ? (lastMedian - firstMedian) / firstMedian : null;
  const firstFifth = between(0, 0.2);

  return {
    intervals,
    zoneS,
    knownS,
    windows,
    medianMps,
    phaseDelta,
    pattern:
      phaseDelta === null || Math.abs(phaseDelta) < PHASE_CHANGE
        ? 'even'
        : phaseDelta > 0
          ? 'faster_end'
          : 'slower_end',
    fastStart:
      firstFifth.length > 0 && medianMps > 0 && median(firstFifth) >= FAST_START_RATIO * medianMps,
  };
}

/** The share of the known time spent in a zone, 0..1 (0 when nothing is known). */
export function zoneShare(profile: SpeedProfile, zone: SpeedZone): number {
  return profile.knownS === 0 ? 0 : profile.zoneS[zone] / profile.knownS;
}

/**
 * The speed at a moment: the median of the intervals within 15 s on either side. Null when no
 * interval is that close (inside a pause or a gap): the app then says "standing".
 */
export function speedAt(profile: SpeedProfile, ts: number): number | null {
  const near = profile.intervals
    .filter((i) => Math.abs(i.ts - ts) <= SPEED_AT_REACH_S * 1000)
    .map((i) => i.mps);
  return near.length === 0 ? null : median(near);
}
