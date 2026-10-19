import {
  busyDays,
  localDay,
  persistentChange,
  unusualWalks,
  weeklyBars,
  weightChange,
  type BusyDay,
  type LoadEvent,
  type UnusualKind,
  type UnusualWalk,
  type WeekBar,
  type WeightChange,
} from '@pawquest/insights';

import { fromIso, toIso } from './ids';
import { walkNumbers } from './periods';
import type { SqlDb } from './sql';

const DAY = 86_400_000;

export interface HealthOverview {
  /** The weight now and against about a month and three months before; null without a weight. */
  readonly weight: WeightChange | null;
  /** The last eight weights, oldest first, for a small row of bars. */
  readonly weights: readonly { readonly at: number; readonly grams: number }[];
  /** Time on foot per week, the last eight weeks. */
  readonly weeks: readonly WeekBar[];
  /** Walks that stood out from the usual (A-18), newest first, at most three. */
  readonly unusual: readonly UnusualWalk[];
  /** The unusual walks keep going one way (the note about the vet), or null. */
  readonly persistent: UnusualKind | null;
  /** The busiest days of the last 90 (A-08). */
  readonly busy: readonly BusyDay[];
}

/**
 * The "Health and activity" section of Insights (docs/23, step 3.16): the weight over time, the
 * activity by week, the unusual walks and the busiest days. Descriptions only.
 */
export function healthOverview(
  db: SqlDb,
  dogId: string,
  now: number,
  tzOffsetMin: number,
): HealthOverview {
  const today = localDay(now, tzOffsetMin);
  const weightRows = db
    .all(
      'SELECT measured_at, weight_g FROM weight_log WHERE dog_id = ? AND deleted_at IS NULL ORDER BY measured_at',
      [dogId],
    )
    .map((r) => ({ at: fromIso(String(r['measured_at'])), grams: Number(r['weight_g']) }));

  const walks = walkNumbers(db, dogId, 0, now + DAY);
  const unusualAll = unusualWalks(
    walks.flatMap((w) =>
      w.durationS === null ? [] : [{ id: w.id, startedAt: w.startedAt, durationS: w.durationS }],
    ),
  );

  const since = toIso(now - 90 * DAY);
  const events: LoadEvent[] = db
    .all(
      `SELECT e.ts, e.tz_offset_min, e.type_id, e.reaction, t.kind
         FROM event e JOIN event_type t ON t.id = e.type_id
        WHERE e.dog_id = ? AND e.deleted_at IS NULL AND e.ts >= ?`,
      [dogId, since],
    )
    .map((r) => ({
      ts: fromIso(String(r['ts'])),
      tzOffsetMin: Number(r['tz_offset_min']),
      kind: String(r['kind']),
      typeId: String(r['type_id']),
      reaction: r['reaction'] === null ? undefined : Number(r['reaction']),
    }));
  const tracked = new Set([
    ...events.map((e) => localDay(e.ts, e.tzOffsetMin)),
    ...walks
      .filter((w) => w.startedAt >= now - 90 * DAY)
      .map((w) => localDay(w.startedAt, w.tzOffsetMin)),
  ]);

  return {
    weight: weightChange(weightRows),
    weights: weightRows.slice(-8),
    weeks: weeklyBars(
      walks
        .filter((w) => w.startedAt >= now - 9 * 7 * DAY)
        .map((w) => ({
          startedAt: w.startedAt,
          tzOffsetMin: w.tzOffsetMin,
          durationS: w.durationS,
          ground: undefined,
        })),
      today,
      8,
    ),
    unusual: [...unusualAll].reverse().slice(0, 3),
    persistent: persistentChange(unusualAll),
    busy: busyDays(events, [...tracked], today),
  };
}
