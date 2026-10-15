import { EARTH_RADIUS_M, isValidLatLon } from '../geo/haversine';
import { median } from '../util/median';

import type { TimedPoint, TimeRange } from './motion';

/**
 * Stay points (spec A-28, D-62): the places where a walk lingered, in three sizes. Unlike a stop
 * (speed under 0.4 m/s), a stay is "the dog and owner stayed inside a small area for a while", so
 * circling a clearing for 15 minutes counts, and so does standing at a shop door.
 */

export type StayScaleName = 'small' | 'medium' | 'large';

export interface StayScale {
  readonly name: StayScaleName;
  /** Every point of a stay lies within this distance of its centre. */
  readonly radiusM: number;
  /** Shortest stay of this size, in seconds. */
  readonly minS: number;
}

/** Largest first: a coarse stay swallows the finer ones that happen inside it. */
export const DEFAULT_STAY_SCALES: readonly StayScale[] = [
  { name: 'large', radiusM: 300, minS: 900 },
  { name: 'medium', radiusM: 120, minS: 480 },
  { name: 'small', radiusM: 40, minS: 180 },
];

export interface StayPoint extends TimedPoint {
  /** Horizontal accuracy in meters; points worse than `maxAccuracyM` are ignored. */
  readonly accuracyM?: number | undefined;
}

export interface StayOptions {
  readonly scales?: readonly StayScale[];
  /** Points less accurate than this do not take part. Default 50 m. */
  readonly maxAccuracyM?: number;
  /** A silence between two points up to this long is bridged when the position is unchanged. Default 1200 s. */
  readonly maxGapS?: number;
  /** Up to this many wild points in a row are skipped instead of ending a stay. Default 3. */
  readonly maxSkip?: number;
  /** Points closer in time than this are thinned out (keeps the work bounded). Default 1 s. */
  readonly minSpacingS?: number;
  /** Manual pauses: a stay never reaches across one. */
  readonly pausedIntervals?: readonly TimeRange[];
}

export interface Stay {
  readonly fromTs: number;
  readonly toTs: number;
  readonly durationS: number;
  /** Median position of the points inside the stay. */
  readonly lat: number;
  readonly lon: number;
  /** 90th percentile of the distance of the points to the centre, in meters. */
  readonly radiusM: number;
  /** The size by the actual spread: standing still is small even when found by a coarse scan. */
  readonly scale: StayScaleName;
  /** Time without points that was bridged (the signal was lost, e.g. in a shop). */
  readonly gapS: number;
  readonly pointCount: number;
  /** Smaller stays inside this one (a stand at the clearing during a walk through the park). */
  readonly inner: readonly Stay[];
}

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const GAP_AFTER_S = 30;
/** A smaller stay covered this much by a larger one is inside it (or a copy of it). */
const COVERED = 0.9;
/** Points at the ends farther than this from the centre (and twice the typical spread) are trimmed. */
const MIN_TRIM_M = 6;
/** At most this many candidate centres are tried per scale. */
const MAX_CENTRES = 1500;
/** A stay is re-centred and trimmed at most this many times. */
const MAX_TRIM_PASSES = 6;

interface P {
  readonly ts: number;
  readonly lat: number;
  readonly lon: number;
  readonly x: number;
  readonly y: number;
}

interface Run {
  readonly members: readonly number[];
  readonly gapS: number;
}

interface Span {
  readonly fromTs: number;
  readonly toTs: number;
}

function assertTrack(points: readonly StayPoint[]): void {
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

/** Flat local coordinates in meters around the first point: good to a fraction of a percent at walk scale. */
function project(points: readonly StayPoint[]): P[] {
  const lat0 = points[0]?.lat ?? 0;
  const lon0 = points[0]?.lon ?? 0;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return points.map((p) => ({
    ts: p.ts,
    lat: p.lat,
    lon: p.lon,
    x: (p.lon - lon0) * M_PER_DEG * cos,
    y: (p.lat - lat0) * M_PER_DEG,
  }));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Splits the points at the manual pauses and drops those inside them. */
function chunks(points: readonly StayPoint[], pauses: readonly TimeRange[]): StayPoint[][] {
  if (pauses.length === 0) {
    return [[...points]];
  }
  const result: StayPoint[][] = [];
  let current: StayPoint[] = [];
  for (const point of points) {
    const paused = pauses.some((r) => point.ts >= r.fromTs && point.ts <= r.toTs);
    const previous = current[current.length - 1];
    // a pause may fall between two kept points (nothing was recorded during it): never join them
    const separated =
      previous !== undefined && pauses.some((r) => previous.ts < r.fromTs && point.ts > r.toTs);
    if ((paused || separated) && current.length > 0) {
      result.push(current);
      current = [];
    }
    if (!paused) {
      current.push(point);
    }
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result;
}

/**
 * The longest stretch of consecutive points around point `j` that stay within `D` of it: grows to
 * both sides, skips up to `maxSkip` wild points in a row, and bridges a silence (up to `maxGapS`)
 * when the position is the same on both sides.
 */
function runAround(
  pts: readonly P[],
  j: number,
  D: number,
  maxGapS: number,
  maxSkip: number,
): { l: number; r: number } {
  const cx = pts[j]?.x ?? 0;
  const cy = pts[j]?.y ?? 0;
  const limit2 = D * D;
  const near = (q: P): boolean => {
    const dx = q.x - cx;
    const dy = q.y - cy;
    return dx * dx + dy * dy <= limit2;
  };
  const grow = (step: 1 | -1): number => {
    let edge = j;
    let k = j + step;
    for (;;) {
      const here = pts[k];
      const from = pts[edge];
      if (
        here === undefined ||
        from === undefined ||
        Math.abs(here.ts - from.ts) / 1000 > maxGapS
      ) {
        return edge;
      }
      if (near(here)) {
        edge = k;
        k += step;
        continue;
      }
      // a few wild points in a row do not end the stay: look for the position coming back
      let resumed = -1;
      for (let skip = 1; skip <= maxSkip; skip++) {
        const ahead = pts[k + step * skip];
        if (ahead === undefined || Math.abs(ahead.ts - from.ts) / 1000 > maxGapS) {
          break;
        }
        if (near(ahead)) {
          resumed = k + step * skip;
          break;
        }
      }
      if (resumed < 0) {
        return edge;
      }
      edge = resumed;
      k = resumed + step;
    }
  };
  return { l: grow(-1), r: grow(1) };
}

/**
 * Finds the places where the track lingered at one scale: for every point (or every few points on
 * a long track) the longest stretch within the scale's radius of it, then the longest stretches
 * first, without overlap. Starting from "every point as a possible centre" instead of from the
 * first point of a window makes the result independent of where the person walked in from.
 */
function detectRuns(pts: readonly P[], scale: StayScale, maxGapS: number, maxSkip: number): Run[] {
  const n = pts.length;
  const candidates: { j: number; l: number; r: number; seconds: number }[] = [];
  const stride = Math.max(1, Math.ceil(n / MAX_CENTRES));
  for (let j = 0; j < n; j += stride) {
    const { l, r } = runAround(pts, j, scale.radiusM, maxGapS, maxSkip);
    const seconds = ((pts[r]?.ts ?? 0) - (pts[l]?.ts ?? 0)) / 1000;
    if (seconds >= scale.minS) {
      candidates.push({ j, l, r, seconds });
    }
  }
  candidates.sort((x, y) => y.seconds - x.seconds || x.j - y.j);

  const taken = new Array<boolean>(n).fill(false);
  const runs: Run[] = [];
  for (const c of candidates) {
    if (taken[c.j] === true) {
      continue;
    }
    // clip to the free part around the centre point
    let l = c.j;
    while (l - 1 >= c.l && taken[l - 1] !== true) {
      l -= 1;
    }
    let r = c.j;
    while (r + 1 <= c.r && taken[r + 1] !== true) {
      r += 1;
    }
    if (((pts[r]?.ts ?? 0) - (pts[l]?.ts ?? 0)) / 1000 < scale.minS) {
      continue;
    }
    const cx = pts[c.j]?.x ?? 0;
    const cy = pts[c.j]?.y ?? 0;
    const members: number[] = [];
    let gapS = 0;
    let previousTs = Number.NaN;
    for (let k = l; k <= r; k++) {
      const q = pts[k];
      if (q === undefined || distance(q.x, q.y, cx, cy) > scale.radiusM) {
        continue;
      }
      if (q.ts - previousTs > GAP_AFTER_S * 1000) {
        gapS += (q.ts - previousTs) / 1000;
      }
      members.push(k);
      previousTs = q.ts;
    }
    for (let k = l; k <= r; k++) {
      taken[k] = true;
    }
    runs.push({ members, gapS });
  }
  return runs.sort((x, y) => (x.members[0] ?? 0) - (y.members[0] ?? 0));
}

function percentile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function scaleOf(radiusM: number): StayScaleName {
  return radiusM <= 40 ? 'small' : radiusM <= 120 ? 'medium' : 'large';
}

/**
 * Builds a stay from member points. The ends are trimmed: points on the way in or out, clearly
 * farther from the centre than the rest, do not belong to the stay. Trimming is done in a few
 * whole passes (each re-centres on the median), not point by point. More than half of the points
 * stay near their own median, so the trimming never empties the list.
 */
function build(pts: readonly P[], memberIdx: readonly number[], gapS: number): Stay {
  let list = memberIdx.flatMap((m) => {
    const q = pts[m];
    return q === undefined ? [] : [q];
  });
  for (let pass = 0; ; pass++) {
    const mx = median(list.map((q) => q.x));
    const my = median(list.map((q) => q.y));
    const spread = list.map((q) => distance(q.x, q.y, mx, my));
    const sorted = [...spread].sort((x, y) => x - y);
    const limit = Math.max(MIN_TRIM_M, 2 * percentile(sorted, 0.5));
    let from = 0;
    while (from < spread.length && (spread[from] ?? 0) > limit) {
      from += 1;
    }
    let to = spread.length;
    while (to > from && (spread[to - 1] ?? 0) > limit) {
      to -= 1;
    }
    const trimmed = from > 0 || to < spread.length;
    if (trimmed && pass < MAX_TRIM_PASSES - 1) {
      list = list.slice(from, to);
      continue;
    }
    const kept = trimmed ? list.slice(from, to) : list;
    const firstTs = kept[0]?.ts ?? 0;
    const lastTs = kept[kept.length - 1]?.ts ?? 0;
    const radiusM = Math.round(percentile(sorted, 0.9) * 10) / 10;
    return {
      fromTs: firstTs,
      toTs: lastTs,
      durationS: (lastTs - firstTs) / 1000,
      lat: median(kept.map((q) => q.lat)),
      lon: median(kept.map((q) => q.lon)),
      radiusM,
      scale: scaleOf(radiusM),
      gapS,
      pointCount: kept.length,
      inner: [],
    };
  }
}

function overlapMs(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.toTs, b.toTs) - Math.max(a.fromTs, b.fromTs));
}

/** The longest part of [from, to] not covered by the (non-overlapping) stays, or null. */
function longestFree(from: number, to: number, taken: readonly Span[]): Span | null {
  const covers = taken
    .filter((s) => overlapMs({ fromTs: from, toTs: to }, s) > 0)
    .sort((a, b) => a.fromTs - b.fromTs);
  let best: Span | null = null;
  let cursor = from;
  const consider = (a: number, b: number): void => {
    if (b > a && (best === null || b - a > best.toTs - best.fromTs)) {
      best = { fromTs: a, toTs: b };
    }
  };
  for (const s of covers) {
    consider(cursor, Math.min(s.fromTs, to));
    cursor = Math.max(cursor, s.toTs);
  }
  consider(cursor, to);
  return best;
}

type Resolved = Required<Omit<StayOptions, 'pausedIntervals'>>;

function findInChunk(points: readonly StayPoint[], options: Resolved): Stay[] {
  const pts = project(points);
  const accepted: Stay[] = [];
  const scales = [...options.scales].sort((a, b) => b.radiusM - a.radiusM);
  for (const scale of scales) {
    for (const run of detectRuns(pts, scale, options.maxGapS, options.maxSkip)) {
      let stay = build(pts, run.members, run.gapS);
      if (stay.durationS < scale.minS) {
        continue;
      }
      const covered = accepted.reduce((sum, s) => sum + overlapMs(stay, s), 0);
      if (covered / (stay.toTs - stay.fromTs) >= COVERED) {
        // inside a larger stay (or a copy of it)
        const parent = accepted
          .map((s) => ({ s, o: overlapMs(stay, s) }))
          .sort((a, b) => b.o - a.o)[0]?.s;
        if (parent !== undefined && stay.durationS < COVERED * parent.durationS) {
          const index = accepted.indexOf(parent);
          // an inner stay never reaches outside the one that contains it
          const fromTs = Math.max(stay.fromTs, parent.fromTs);
          const toTs = Math.min(stay.toTs, parent.toTs);
          const inner = { ...stay, fromTs, toTs, durationS: (toTs - fromTs) / 1000 };
          accepted[index] = { ...parent, inner: [...parent.inner, inner] };
        }
        continue;
      }
      if (covered > 0) {
        // overlaps a larger stay only in part: keep the longest part that is free
        const free = longestFree(stay.fromTs, stay.toTs, accepted);
        const kept = run.members.filter((m) => {
          const ts = pts[m]?.ts ?? Number.NaN;
          return ts >= (free?.fromTs ?? Number.NaN) && ts <= (free?.toTs ?? Number.NaN);
        });
        const clipped = build(pts, kept, run.gapS);
        if (clipped.durationS < scale.minS) {
          continue;
        }
        stay = clipped;
      }
      accepted.push(stay);
    }
  }
  return accepted
    .sort((a, b) => a.fromTs - b.fromTs)
    .map((s) => ({ ...s, inner: [...s.inner].sort((a, b) => a.fromTs - b.fromTs) }));
}

/**
 * Finds the stays of a track (spec A-28): windows that remain within a scale's radius of their own
 * centre for at least its minimum time, at three sizes (40 m / 3 min, 120 m / 8 min, 300 m /
 * 15 min). Larger stays contain the smaller ones that happen inside them; the result is sorted
 * and never overlaps. Points must be time-ordered (use the output of the GPS filter).
 *
 * @throws RangeError for unsorted timestamps or invalid coordinates.
 */
export function findStays(points: readonly StayPoint[], options: StayOptions = {}): Stay[] {
  assertTrack(points);
  const maxAccuracyM = options.maxAccuracyM ?? 50;
  const minSpacingMs = (options.minSpacingS ?? 1) * 1000;
  const usable: StayPoint[] = [];
  for (const point of points) {
    if (point.accuracyM !== undefined && point.accuracyM > maxAccuracyM) {
      continue;
    }
    const previous = usable[usable.length - 1];
    if (previous === undefined || point.ts - previous.ts >= minSpacingMs) {
      usable.push(point);
    }
  }
  const resolved: Resolved = {
    scales: options.scales ?? DEFAULT_STAY_SCALES,
    maxAccuracyM,
    maxGapS: options.maxGapS ?? 1200,
    maxSkip: options.maxSkip ?? 3,
    minSpacingS: options.minSpacingS ?? 1,
  };
  return chunks(usable, options.pausedIntervals ?? [])
    .filter((chunk) => chunk.length >= 2)
    .flatMap((chunk) => findInChunk(chunk, resolved));
}
