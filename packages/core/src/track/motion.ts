import { haversineDistanceM, isValidLatLon, type LatLon } from '../geo/haversine';
import { median } from '../util/median';

/** A track point with a time. Same shape as an accepted GPS fix (see track/filter). */
export interface TimedPoint extends LatLon {
  readonly ts: number;
  /** Device-reported speed in m/s, if any. */
  readonly speedMps?: number | undefined;
}

/** A time range in epoch milliseconds. */
export interface TimeRange {
  readonly fromTs: number;
  readonly toTs: number;
}

export interface MotionConfig {
  /** Below this speed an interval counts as slow (spec A-03). */
  readonly movingSpeedMps: number;
  /** A series of slow intervals no longer than this still counts as movement. */
  readonly minStopS: number;
  /** A stop longer than this is flagged for place clustering (A-12). */
  readonly longStopS: number;
  /** An interval between accepted points longer than this is a gap (unknown movement). */
  readonly gapAfterS: number;
  /** Device speeds above this are ignored as implausible for a dog walk. */
  readonly maxPlausibleSpeedMps: number;
}

export const DEFAULT_MOTION_CONFIG: Readonly<MotionConfig> = {
  movingSpeedMps: 0.4,
  minStopS: 10,
  longStopS: 180,
  gapAfterS: 30,
  maxPlausibleSpeedMps: 12,
};

export interface Stop {
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  /** Median position of the points inside the stop. */
  readonly lat: number;
  readonly lon: number;
  /** Longer than `longStopS`: input for place clustering. */
  readonly isLongStop: boolean;
}

/** The four classes are disjoint and add up to `totalS` (time from first to last point). */
export interface MotionSummary {
  readonly movingS: number;
  readonly stoppedS: number;
  readonly pausedS: number;
  readonly gapS: number;
  readonly totalS: number;
  readonly stops: readonly Stop[];
}

const SPEED_WINDOW_REACH = 2; // median over 5 points

function assertTrack(points: readonly TimedPoint[]): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!isValidLatLon(point) || !Number.isFinite(point.ts)) {
      throw new RangeError('every point needs finite lat/lon in range and a finite ts');
    }
    if (point.ts <= previous) {
      throw new RangeError('timestamps must be strictly increasing');
    }
    previous = point.ts;
  }
}

function intervalSpeed(
  points: readonly TimedPoint[],
  from: number,
  config: Readonly<MotionConfig>,
): number | undefined {
  const a = points[from];
  const b = points[from + 1];
  if (a === undefined || b === undefined) {
    return undefined;
  }
  const dtS = (b.ts - a.ts) / 1000;
  if (dtS > config.gapAfterS) {
    return undefined;
  }
  const v = haversineDistanceM(a, b) / dtS;
  return v <= config.maxPlausibleSpeedMps ? v : undefined;
}

/**
 * Smoothed speed per point in m/s (spec A-25, step 1; also used by A-03).
 *
 * Raw speed is the device speed when finite and within [0, maxPlausibleSpeedMps], otherwise the
 * distance/time of the previous interval (or the next one, at the start or after a gap). Intervals
 * longer than `gapAfterS` and implausible speeds are treated as missing. The result is the median
 * over a window of 5 points (symmetrically narrower near the ends) of the available raw values;
 * 0 when none is available.
 */
export function pointSpeeds(
  points: readonly TimedPoint[],
  config: Readonly<MotionConfig> = DEFAULT_MOTION_CONFIG,
): number[] {
  assertTrack(points);
  const n = points.length;
  const raw: (number | undefined)[] = points.map((point, i) => {
    const device = point.speedMps;
    if (
      device !== undefined &&
      Number.isFinite(device) &&
      device >= 0 &&
      device <= config.maxPlausibleSpeedMps
    ) {
      return device;
    }
    return intervalSpeed(points, i - 1, config) ?? intervalSpeed(points, i, config);
  });

  return raw.map((_, i) => {
    const reach = Math.min(SPEED_WINDOW_REACH, i, n - 1 - i);
    const window: number[] = [];
    for (let j = i - reach; j <= i + reach; j++) {
      const v = raw[j];
      if (v !== undefined) {
        window.push(v);
      }
    }
    return window.length === 0 ? 0 : median(window);
  });
}

type Kind = 'moving' | 'slow' | 'gap' | 'paused' | 'stopped';

interface Piece {
  t0: number;
  t1: number;
  kind: Kind;
}

/** Sorted, merged, valid pause ranges clipped to [from, to]. */
function normalisePauses(ranges: readonly TimeRange[], from: number, to: number): TimeRange[] {
  const clipped = ranges
    .filter((r) => Number.isFinite(r.fromTs) && Number.isFinite(r.toTs) && r.toTs > r.fromTs)
    .map((r) => ({ fromTs: Math.max(r.fromTs, from), toTs: Math.min(r.toTs, to) }))
    .filter((r) => r.toTs > r.fromTs)
    .sort((a, b) => a.fromTs - b.fromTs);
  const merged: TimeRange[] = [];
  for (const r of clipped) {
    const last = merged[merged.length - 1];
    if (last !== undefined && r.fromTs <= last.toTs) {
      merged[merged.length - 1] = { fromTs: last.fromTs, toTs: Math.max(last.toTs, r.toTs) };
    } else {
      merged.push(r);
    }
  }
  return merged;
}

/** Cuts one interval into pieces, labelling the parts inside manual pauses as `paused`. */
function carve(t0: number, t1: number, kind: Kind, pauses: readonly TimeRange[]): Piece[] {
  const pieces: Piece[] = [];
  let cursor = t0;
  for (const pause of pauses) {
    if (pause.toTs <= cursor || pause.fromTs >= t1) {
      continue;
    }
    if (pause.fromTs > cursor) {
      pieces.push({ t0: cursor, t1: pause.fromTs, kind });
    }
    const end = Math.min(pause.toTs, t1);
    pieces.push({ t0: Math.max(pause.fromTs, cursor), t1: end, kind: 'paused' });
    cursor = end;
  }
  if (cursor < t1) {
    pieces.push({ t0: cursor, t1, kind });
  }
  return pieces;
}

export interface AnalyzeMotionOptions {
  /** Manual pauses recorded by the app, in epoch milliseconds. */
  readonly pausedIntervals?: readonly TimeRange[];
  readonly config?: Readonly<MotionConfig>;
}

/**
 * Splits the time of a track into moving / stopped / paused / gap (spec A-03, decision D-47) and
 * lists the stops. Points must be strictly increasing in time (use the output of the GPS filter).
 *
 * @throws RangeError for unsorted timestamps or invalid coordinates.
 */
export function analyzeMotion(
  points: readonly TimedPoint[],
  options: AnalyzeMotionOptions = {},
): MotionSummary {
  const config = options.config ?? DEFAULT_MOTION_CONFIG;
  assertTrack(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || points.length < 2) {
    return { movingS: 0, stoppedS: 0, pausedS: 0, gapS: 0, totalS: 0, stops: [] };
  }

  const speeds = pointSpeeds(points, config);
  const pauses = normalisePauses(options.pausedIntervals ?? [], first.ts, last.ts);

  const pieces: Piece[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const va = speeds[i];
    const vb = speeds[i + 1];
    if (a === undefined || b === undefined || va === undefined || vb === undefined) {
      continue;
    }
    let kind: Kind;
    if ((b.ts - a.ts) / 1000 > config.gapAfterS) {
      kind = 'gap';
    } else {
      kind = (va + vb) / 2 >= config.movingSpeedMps ? 'moving' : 'slow';
    }
    pieces.push(...carve(a.ts, b.ts, kind, pauses));
  }

  // Series of consecutive slow pieces: short ones are still movement, long ones are stops.
  const stops: Stop[] = [];
  for (let i = 0; i < pieces.length;) {
    const start = pieces[i];
    if (start?.kind !== 'slow') {
      i += 1;
      continue;
    }
    let end = i;
    while (pieces[end + 1]?.kind === 'slow') {
      end += 1;
    }
    const run = pieces.slice(i, end + 1);
    const fromTs = start.t0;
    const toTs = run[run.length - 1]?.t1 ?? start.t1;
    const durationS = (toTs - fromTs) / 1000;
    if (durationS <= config.minStopS) {
      for (const piece of run) {
        piece.kind = 'moving';
      }
    } else {
      for (const piece of run) {
        piece.kind = 'stopped';
      }
      const inside = points.filter((point) => point.ts >= fromTs && point.ts <= toTs);
      stops.push({
        fromTs,
        toTs,
        durationS,
        lat: median(inside.map((point) => point.lat)),
        lon: median(inside.map((point) => point.lon)),
        isLongStop: durationS > config.longStopS,
      });
    }
    i = end + 1;
  }

  const totals: Record<Kind, number> = { moving: 0, slow: 0, gap: 0, paused: 0, stopped: 0 };
  for (const piece of pieces) {
    totals[piece.kind] += (piece.t1 - piece.t0) / 1000;
  }
  return {
    movingS: totals.moving,
    stoppedS: totals.stopped,
    pausedS: totals.paused,
    gapS: totals.gap,
    totalS: (last.ts - first.ts) / 1000,
    stops,
  };
}
