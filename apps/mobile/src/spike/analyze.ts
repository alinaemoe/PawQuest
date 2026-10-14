import { analyzeMotion, filterTrack, type DropReason } from '@pawquest/core';

import type { LoggedFix } from './gpsTask';

export interface SpikeReport {
  readonly rawCount: number;
  readonly acceptedCount: number;
  readonly dropped: Readonly<Partial<Record<DropReason, number>>>;
  readonly distanceM: number;
  readonly durationS: number;
  readonly movingS: number;
  readonly stoppedS: number;
  readonly gapS: number;
  /** Intervals between consecutive RAW fixes longer than 30 s (what the OS failed to deliver). */
  readonly rawGaps: readonly { readonly fromTs: number; readonly seconds: number }[];
  readonly longestRawGapS: number;
  /** Median seconds between consecutive raw fixes. */
  readonly medianIntervalS: number | null;
  /** Median seconds between a fix's own timestamp and when the app received it. */
  readonly medianDeliveryDelayS: number | null;
  readonly medianAccuracyM: number | null;
  readonly mockedCount: number;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}

/** Runs a recorded log through the real domain code (filter A-01, motion A-03). */
export function buildReport(fixes: readonly LoggedFix[]): SpikeReport {
  const ordered = [...fixes].sort((a, b) => a.ts - b.ts);
  const filtered = filterTrack(
    ordered.map((f) => ({
      ts: f.ts,
      lat: f.lat,
      lon: f.lon,
      accuracyM: f.accuracyM ?? undefined,
      speedMps: f.speedMps ?? undefined,
    })),
  );

  const dropped: Partial<Record<DropReason, number>> = {};
  for (const d of filtered.dropped) {
    dropped[d.reason] = (dropped[d.reason] ?? 0) + 1;
  }

  const first = filtered.points[0];
  const last = filtered.points[filtered.points.length - 1];
  const motion = analyzeMotion(filtered.points);

  const intervals: number[] = [];
  const rawGaps: { fromTs: number; seconds: number }[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1];
    const b = ordered[i];
    if (a !== undefined && b !== undefined) {
      const seconds = (b.ts - a.ts) / 1000;
      intervals.push(seconds);
      if (seconds > 30) {
        rawGaps.push({ fromTs: a.ts, seconds });
      }
    }
  }

  return {
    rawCount: ordered.length,
    acceptedCount: filtered.points.length,
    dropped,
    distanceM: filtered.distanceM,
    durationS: first !== undefined && last !== undefined ? (last.ts - first.ts) / 1000 : 0,
    movingS: motion.movingS,
    stoppedS: motion.stoppedS,
    gapS: motion.gapS,
    rawGaps,
    longestRawGapS: rawGaps.reduce((m, g) => Math.max(m, g.seconds), 0),
    medianIntervalS: median(intervals),
    medianDeliveryDelayS: median(ordered.map((f) => (f.receivedAt - f.ts) / 1000)),
    medianAccuracyM: median(ordered.flatMap((f) => (f.accuracyM === null ? [] : [f.accuracyM]))),
    mockedCount: ordered.filter((f) => f.mocked).length,
  };
}
