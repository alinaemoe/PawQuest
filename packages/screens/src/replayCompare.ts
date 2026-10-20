import type { WalkReplay } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';

import { makeReplayEngine, type ReplayEngine, type ReplayFrame } from './replayEngine';

/** Two walks played side by side (docs/23, step 3.20; docs/04, S07-Cmp). */

/** "By progress": both walks at the same share of their time. "By time": both at the same time from the start. */
export type CompareSync = 'progress' | 'time';

export interface CompareAxis {
  /** The length of the shared axis, in ms. */
  readonly lengthMs: number;
  /** Where on its own axis the first walk is when the shared axis stands at `master`. */
  axisA(master: number): number;
  axisB(master: number): number;
}

/**
 * By progress the first walk leads and the second is stretched to the same share of its length; by
 * time the longer walk leads and the shorter one stops at its end while the other goes on.
 */
export function compareAxis(lengthA: number, lengthB: number, sync: CompareSync): CompareAxis {
  const a = Math.max(1, lengthA);
  const b = Math.max(1, lengthB);
  if (sync === 'progress') {
    return {
      lengthMs: a,
      axisA: (m) => Math.min(a, Math.max(0, m)),
      axisB: (m) => Math.min(b, Math.max(0, (m / a) * b)),
    };
  }
  return {
    lengthMs: Math.max(a, b),
    axisA: (m) => Math.min(a, Math.max(0, m)),
    axisB: (m) => Math.min(b, Math.max(0, m)),
  };
}

/** The first walk keeps the accent colour, the second one is warm, so the two tell apart on any map. */
export const COMPARE_PAINT = {
  light: { a: '#2f7d5b', b: '#c2603a' },
  dark: { a: '#5fc79a', b: '#e8805f' },
} as const;

/** Under this the two are "level": a few meters is the noise of the phone. */
const LEVEL_M = 25;

export interface CompareRow {
  readonly key: string;
  readonly label: string;
  readonly a: string;
  readonly b: string;
}

const MIN_PACE_DISTANCE_M = 200;

export interface CompareSide {
  readonly replay: WalkReplay;
  readonly engine: ReplayEngine;
}

export function compareSide(replay: WalkReplay): CompareSide {
  return { replay, engine: makeReplayEngine(replay, 'moving') };
}

function distanceOf(replay: WalkReplay): number {
  return replay.cumulativeM[replay.cumulativeM.length - 1] ?? 0;
}

/** The two walks in numbers: duration, distance, pace on the move, and events. Facts, not a grade. */
export function compareRows(a: CompareSide, b: CompareSide, i18n: I18n): CompareRow[] {
  const pace = (side: CompareSide): number | null => {
    const distance = distanceOf(side.replay);
    return distance < MIN_PACE_DISTANCE_M
      ? null
      : side.engine.lengthMs / 60_000 / (distance / 1000);
  };
  const seconds = (side: CompareSide): number =>
    Math.round((side.replay.endTs - side.replay.startTs) / 1000);
  return [
    {
      key: 'duration',
      label: i18n.t('twowalks.row.duration'),
      a: i18n.formatDuration(seconds(a)),
      b: i18n.formatDuration(seconds(b)),
    },
    {
      key: 'distance',
      label: i18n.t('twowalks.row.distance'),
      a: i18n.formatDistance(distanceOf(a.replay)),
      b: i18n.formatDistance(distanceOf(b.replay)),
    },
    {
      key: 'pace',
      label: i18n.t('twowalks.row.pace'),
      a: i18n.formatPace(pace(a)),
      b: i18n.formatPace(pace(b)),
    },
    {
      key: 'events',
      label: i18n.t('twowalks.row.events'),
      a: String(a.replay.events.length),
      b: String(b.replay.events.length),
    },
  ];
}

/** "Первая впереди на 120 м" / "вровень": who has covered more at this moment. */
export function leadText(frameA: ReplayFrame, frameB: ReplayFrame, i18n: I18n): string {
  const diff = frameA.distanceM - frameB.distanceM;
  if (Math.abs(diff) < LEVEL_M) {
    return i18n.t('twowalks.level');
  }
  return i18n.t(diff > 0 ? 'twowalks.aAhead' : 'twowalks.bAhead', {
    distance: i18n.formatDistance(Math.abs(diff)),
  });
}

/** "3,2 км/ч", or "стоим" where the speed is unknown: short enough for a column of a table. */
function shortSpeed(mps: number | null, i18n: I18n): string {
  return mps === null || mps < 0.4
    ? i18n.t('replay.standing')
    : i18n.formatSpeed(1000 / (mps * 60));
}

/** What each walk has right now, at the moment on the slider: the way covered and the pace. */
export function liveRows(frameA: ReplayFrame, frameB: ReplayFrame, i18n: I18n): CompareRow[] {
  return [
    {
      key: 'covered',
      label: i18n.t('twowalks.row.covered'),
      a: i18n.formatDistance(frameA.distanceM),
      b: i18n.formatDistance(frameB.distanceM),
    },
    {
      key: 'now',
      label: i18n.t('twowalks.row.now'),
      a: shortSpeed(frameA.speedMps, i18n),
      b: shortSpeed(frameB.speedMps, i18n),
    },
  ];
}
