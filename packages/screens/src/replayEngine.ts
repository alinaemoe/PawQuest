import {
  gapRanges,
  movingTimeAxis,
  positionAt,
  speedAt,
  speedZoneOf,
  type SpeedZone,
  type TimeAxis,
} from '@pawquest/core';
import type { ReplayPass, WalkReplay } from '@pawquest/data';

/** The playback of a walk (docs/04, S07): what is where at a moment of the time axis. */

export type ReplayAxisMode = 'moving' | 'real';

export interface ReplayFrame {
  readonly wallTs: number;
  readonly lat: number;
  readonly lon: number;
  readonly distanceM: number;
  /** Null where the speed is unknown: in a pause or across a gap ("standing"). */
  readonly speedMps: number | null;
  readonly zone: SpeedZone;
  /** Events that happened up to this moment. */
  readonly eventsSoFar: number;
  /** The saved route the walk is on at this moment. */
  readonly pass: ReplayPass | null;
}

export interface ReplayTick {
  readonly key: string;
  readonly kind: 'event' | 'photo';
  /** Where on the axis, 0..1. */
  readonly at: number;
  readonly ts: number;
}

export interface ReplayStretch {
  readonly from: number;
  readonly to: number;
}

export interface ReplayEngine {
  readonly mode: ReplayAxisMode;
  readonly lengthMs: number;
  readonly ticks: readonly ReplayTick[];
  /** The saved routes as stretches of the axis, 0..1. */
  readonly passes: readonly (ReplayStretch & { readonly pass: ReplayPass })[];
  /** Pauses and gaps as stretches of the real-time axis (empty on the moving axis), 0..1. */
  readonly hidden: readonly ReplayStretch[];
  frameAt(axisMs: number): ReplayFrame;
  /** The axis time of a moment (clamped). */
  axisOf(wallTs: number): number;
  /** The time of the next / previous event after / before an axis time, or null. */
  nextEventMs(axisMs: number): number | null;
  previousEventMs(axisMs: number): number | null;
}

/** Cumulative distance at a moment: linear between the two points around it. */
function distanceAt(replay: WalkReplay, ts: number): number {
  const { points, cumulativeM } = replay;
  let lo = 0;
  let hi = points.length - 1;
  if (ts <= (points[0]?.ts ?? 0)) {
    return 0;
  }
  if (ts >= (points[hi]?.ts ?? 0)) {
    return cumulativeM[hi] ?? 0;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((points[mid]?.ts ?? 0) <= ts) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = points[lo];
  const b = points[hi];
  const from = cumulativeM[lo] ?? 0;
  const to = cumulativeM[hi] ?? from;
  if (a === undefined || b === undefined || b.ts === a.ts) {
    return from;
  }
  return from + ((to - from) * (ts - a.ts)) / (b.ts - a.ts);
}

export function makeReplayEngine(replay: WalkReplay, mode: ReplayAxisMode): ReplayEngine {
  const gaps = gapRanges(replay.points);
  const excluded = [...replay.paused, ...gaps];
  // a pause usually sits inside a gap of the track: draw them as one
  const merged: { fromTs: number; toTs: number }[] = [];
  for (const r of [...excluded].sort((a, b) => a.fromTs - b.fromTs)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && r.fromTs <= last.toTs) {
      merged[merged.length - 1] = { fromTs: last.fromTs, toTs: Math.max(last.toTs, r.toTs) };
    } else {
      merged.push({ fromTs: r.fromTs, toTs: r.toTs });
    }
  }
  const axis: TimeAxis = movingTimeAxis(
    replay.startTs,
    replay.endTs,
    mode === 'moving' ? excluded : [],
  );
  const length = Math.max(1, axis.lengthMs);
  const fraction = (ts: number): number => Math.min(1, Math.max(0, axis.toAxis(ts) / length));

  const ticks: ReplayTick[] = [
    ...replay.events.map((e): ReplayTick => ({
      key: e.id,
      kind: 'event',
      at: fraction(e.ts),
      ts: e.ts,
    })),
    ...replay.photos.map((p): ReplayTick => ({
      key: p.id,
      kind: 'photo',
      at: fraction(p.takenAt),
      ts: p.takenAt,
    })),
  ].sort((a, b) => a.at - b.at);
  const eventTimes = replay.events.map((e) => axis.toAxis(e.ts)).sort((a, b) => a - b);

  return {
    mode,
    lengthMs: axis.lengthMs,
    ticks,
    passes: replay.passes.map((pass) => ({
      from: fraction(pass.fromTs),
      to: fraction(pass.toTs),
      pass,
    })),
    hidden:
      mode === 'real'
        ? merged.map((r) => ({ from: fraction(r.fromTs), to: fraction(r.toTs) }))
        : [],
    frameAt(axisMs: number): ReplayFrame {
      const wallTs = axis.toWall(axisMs);
      const position = positionAt(replay.points, wallTs, { pausedRanges: replay.paused });
      const speed = replay.profile === null ? null : speedAt(replay.profile, wallTs);
      const inPause = replay.paused.some((r) => wallTs >= r.fromTs && wallTs < r.toTs);
      const mps = inPause ? null : speed;
      return {
        wallTs,
        lat: position?.lat ?? replay.points[0]?.lat ?? 0,
        lon: position?.lon ?? replay.points[0]?.lon ?? 0,
        distanceM: distanceAt(replay, wallTs),
        speedMps: mps,
        zone: speedZoneOf(mps ?? 0),
        eventsSoFar: replay.events.filter((e) => e.ts <= wallTs).length,
        pass: replay.passes.find((p) => wallTs >= p.fromTs && wallTs <= p.toTs) ?? null,
      };
    },
    axisOf: (wallTs) => axis.toAxis(wallTs),
    nextEventMs: (axisMs) => eventTimes.find((t) => t > axisMs + 500) ?? null,
    previousEventMs: (axisMs) => [...eventTimes].reverse().find((t) => t < axisMs - 500) ?? null,
  };
}
