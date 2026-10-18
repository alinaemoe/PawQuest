import { median } from '@pawquest/core';

import { mondayOf } from './calendar';
import { localDay } from './time';

/**
 * A place week by week (docs/23, step 3.13): how many walks, how long a typical one, how many
 * events. A place is told about from this many walks; fewer are shown, marked "few".
 */
export const MIN_PLACE_WALKS = 5;

export interface PlaceWalk {
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  readonly events: number;
}

export interface PlaceWeek {
  readonly mondayDay: number;
  readonly walks: number;
  /** The typical (median) length of the walks of the week, null without a known length. */
  readonly medianS: number | null;
  readonly events: number;
}

/** The last `weeks` weeks (the one of `today` last); weeks without walks are zero rows. */
export function placeWeeks(walks: readonly PlaceWalk[], today: number, weeks: number): PlaceWeek[] {
  const firstMonday = mondayOf(today) - (weeks - 1) * 7;
  const buckets = Array.from({ length: Math.max(0, weeks) }, () => ({
    walks: 0,
    durations: [] as number[],
    events: 0,
  }));
  for (const walk of walks) {
    const day = localDay(walk.startedAt, walk.tzOffsetMin);
    if (day > today || mondayOf(day) < firstMonday) {
      continue;
    }
    const bucket = buckets[Math.floor((mondayOf(day) - firstMonday) / 7)];
    if (bucket === undefined) {
      continue;
    }
    bucket.walks += 1;
    bucket.events += walk.events;
    if (walk.durationS !== null) {
      bucket.durations.push(walk.durationS);
    }
  }
  return buckets.map((b, i) => ({
    mondayDay: firstMonday + i * 7,
    walks: b.walks,
    medianS: b.durations.length === 0 ? null : median(b.durations),
    events: b.events,
  }));
}

export interface PlaceSummary {
  readonly walks: number;
  readonly totalS: number;
  readonly medianS: number | null;
  readonly events: number;
  readonly lastAt: number | null;
  /** Enough walks to be told about (see MIN_PLACE_WALKS). */
  readonly enough: boolean;
}

export function placeSummary(walks: readonly PlaceWalk[]): PlaceSummary {
  const durations = walks.flatMap((w) => (w.durationS === null ? [] : [w.durationS]));
  return {
    walks: walks.length,
    totalS: durations.reduce((sum, d) => sum + d, 0),
    medianS: durations.length === 0 ? null : median(durations),
    events: walks.reduce((sum, w) => sum + w.events, 0),
    lastAt: walks.length === 0 ? null : Math.max(...walks.map((w) => w.startedAt)),
    enough: walks.length >= MIN_PLACE_WALKS,
  };
}
