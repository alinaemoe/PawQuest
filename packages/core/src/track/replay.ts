import type { LatLon } from '../geo/haversine';

import type { TimeRange } from './motion';

/** A stored track point used for playback. */
export interface ReplayPoint extends LatLon {
  readonly ts: number;
}

export interface PlaybackOptions {
  /** Manual pauses (epoch ms): the position stays where it was. */
  readonly pausedRanges?: readonly TimeRange[];
  /** An interval between points longer than this is a gap: the position stays frozen. Default 30. */
  readonly gapAfterS?: number;
}

const DEFAULT_GAP_AFTER_S = 30;

/**
 * Position at a moment of the walk (spec A-05, decision D-48): binary search for the interval
 * containing `ts` and linear interpolation inside it. Before the first point the first point is
 * returned, after the last point the last one; an empty track gives null. Inside a manual pause or
 * across a gap longer than `gapAfterS` the position stays at the earlier point.
 */
export function positionAt(
  points: readonly ReplayPoint[],
  ts: number,
  options: PlaybackOptions = {},
): LatLon | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  if (ts <= first.ts) {
    return { lat: first.lat, lon: first.lon };
  }
  if (ts >= last.ts) {
    return { lat: last.lat, lon: last.lon };
  }

  // Largest index whose timestamp is <= ts (exists and is < length - 1 because first < ts < last).
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const midPoint = points[mid];
    if (midPoint !== undefined && midPoint.ts <= ts) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = points[lo];
  const b = points[lo + 1];
  if (a === undefined || b === undefined) {
    return { lat: last.lat, lon: last.lon };
  }

  const gapAfterS = options.gapAfterS ?? DEFAULT_GAP_AFTER_S;
  const frozen =
    (b.ts - a.ts) / 1000 > gapAfterS ||
    (options.pausedRanges ?? []).some((r) => ts >= r.fromTs && ts < r.toTs);
  if (frozen) {
    return { lat: a.lat, lon: a.lon };
  }
  const f = (ts - a.ts) / (b.ts - a.ts);
  return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon) };
}

/** Intervals between consecutive points that are longer than `gapAfterS` seconds. */
export function gapRanges(
  points: readonly ReplayPoint[],
  gapAfterS: number = DEFAULT_GAP_AFTER_S,
): TimeRange[] {
  const gaps: TimeRange[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a !== undefined && b !== undefined && (b.ts - a.ts) / 1000 > gapAfterS) {
      gaps.push({ fromTs: a.ts, toTs: b.ts });
    }
  }
  return gaps;
}

/** A mapping between wall-clock time and a time axis that skips excluded ranges. */
export interface TimeAxis {
  /** Axis length in milliseconds: the track duration minus the excluded time. */
  readonly lengthMs: number;
  /** Wall time to axis time (clamped to the track). Time inside an exclusion maps to its start. */
  toAxis(wallTs: number): number;
  /**
   * Axis time to wall time (clamped to [0, length]). Left-continuous: on the boundary of an
   * exclusion the start of the excluded range is returned.
   */
  toWall(axisMs: number): number;
}

/**
 * Builds the "moving" time axis of the replay (A-05): the walk from `startTs` to `endTs` with the
 * excluded ranges (manual pauses and gaps) removed. Ranges are clipped to the track, merged when
 * overlapping, and invalid ones (non-finite or empty) are ignored.
 *
 * @throws RangeError if the bounds are not finite or `endTs < startTs`.
 */
export function movingTimeAxis(
  startTs: number,
  endTs: number,
  excluded: readonly TimeRange[],
): TimeAxis {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) {
    throw new RangeError('startTs and endTs must be finite with endTs >= startTs');
  }
  const sorted = excluded
    .filter((r) => Number.isFinite(r.fromTs) && Number.isFinite(r.toTs))
    .map((r) => ({ fromTs: Math.max(r.fromTs, startTs), toTs: Math.min(r.toTs, endTs) }))
    .filter((r) => r.toTs > r.fromTs)
    .sort((x, y) => x.fromTs - y.fromTs);
  const ranges: TimeRange[] = [];
  for (const r of sorted) {
    const prev = ranges[ranges.length - 1];
    if (prev !== undefined && r.fromTs <= prev.toTs) {
      ranges[ranges.length - 1] = { fromTs: prev.fromTs, toTs: Math.max(prev.toTs, r.toTs) };
    } else {
      ranges.push(r);
    }
  }
  const excludedTotal = ranges.reduce((sum, r) => sum + (r.toTs - r.fromTs), 0);
  const lengthMs = endTs - startTs - excludedTotal;

  return {
    lengthMs,
    toAxis(wallTs: number): number {
      const t = Math.min(Math.max(wallTs, startTs), endTs);
      let skipped = 0;
      for (const r of ranges) {
        if (r.fromTs >= t) {
          break;
        }
        skipped += Math.min(r.toTs, t) - r.fromTs;
      }
      return t - startTs - skipped;
    },
    toWall(axisMs: number): number {
      const a = Math.min(Math.max(axisMs, 0), lengthMs);
      let skipped = 0;
      for (const r of ranges) {
        const axisStart = r.fromTs - startTs - skipped;
        if (axisStart < a) {
          skipped += r.toTs - r.fromTs;
        } else {
          break;
        }
      }
      return startTs + a + skipped;
    },
  };
}
