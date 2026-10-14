import { median } from '../util/median';

import { DEFAULT_MOTION_CONFIG, pointSpeeds, type TimedPoint } from './motion';

/** Average pace is not shown for shorter walks than this (spec A-04). */
export const MIN_PACE_DISTANCE_M = 200;

/**
 * Average pace in minutes per kilometre: (movingS / 60) / (distanceM / 1000).
 * Returns null when it is not meaningful: distance below 200 m, or no moving time.
 *
 * @throws RangeError if an argument is not a finite number >= 0.
 */
export function averagePaceMinPerKm(movingS: number, distanceM: number): number | null {
  if (!Number.isFinite(movingS) || !Number.isFinite(distanceM) || movingS < 0 || distanceM < 0) {
    throw new RangeError('movingS and distanceM must be finite numbers >= 0');
  }
  if (distanceM < MIN_PACE_DISTANCE_M || movingS === 0) {
    return null;
  }
  return movingS / 60 / (distanceM / 1000);
}

/**
 * Pace in minutes per kilometre for a speed in m/s. Returns null below `minSpeedMps`
 * (default: the standing threshold of A-03), where pace would be meaningless.
 *
 * @throws RangeError if the speed is not a finite number >= 0.
 */
export function paceFromSpeedMinPerKm(
  speedMps: number,
  minSpeedMps: number = DEFAULT_MOTION_CONFIG.movingSpeedMps,
): number | null {
  if (!Number.isFinite(speedMps) || speedMps < 0) {
    throw new RangeError('speedMps must be a finite number >= 0');
  }
  return speedMps < minSpeedMps ? null : 1000 / (speedMps * 60);
}

/**
 * Current speed in m/s: the median of the smoothed point speeds (A-25) whose time lies in the
 * half-open window (nowTs - windowS, nowTs]. Returns null when no point is inside the window.
 */
export function currentSpeedMps(
  points: readonly TimedPoint[],
  nowTs: number,
  windowS = 30,
): number | null {
  const speeds = pointSpeeds(points);
  const from = nowTs - windowS * 1000;
  const inWindow: number[] = [];
  points.forEach((point, i) => {
    const v = speeds[i];
    if (v !== undefined && point.ts > from && point.ts <= nowTs) {
      inWindow.push(v);
    }
  });
  return inWindow.length === 0 ? null : median(inWindow);
}
