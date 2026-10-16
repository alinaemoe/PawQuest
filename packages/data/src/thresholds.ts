import {
  reactionDistanceSeries,
  recoverySeries,
  type RecoverySeries,
  type WeeklySeries,
} from '@pawquest/insights';

import { listEventTypes, type EventType } from './events';
import { fromIso } from './ids';
import type { SqlDb } from './sql';

export interface TriggerDistance {
  readonly type: EventType;
  readonly series: WeeklySeries;
}

export interface ThresholdSeries {
  /** For each kind of trigger with a distance series of at least two weeks, most events first. */
  readonly distances: readonly TriggerDistance[];
  /** After the hard moments (the types that start the recovery timer). */
  readonly recovery: RecoverySeries;
}

interface EventRow {
  readonly typeId: string;
  readonly ts: number;
  readonly tzOffsetMin: number;
  readonly reaction: number | null;
  readonly distanceM: number | null;
  readonly bucket: string | null;
  readonly recoveryS: number | null;
}

const num = (value: unknown): number | null => (value === null ? null : Number(value));

/**
 * Reaction distance (A-15) and recovery time (A-16) from the events of a dog, by week. A kind of
 * trigger is listed only when its series has two weeks with enough events; a series cannot be
 * told from a single week.
 */
export function thresholdSeries(db: SqlDb, dogId: string): ThresholdSeries {
  const types = listEventTypes(db, true);
  const events = db
    .all(
      `SELECT type_id, ts, tz_offset_min, reaction, distance_m, distance_bucket, recovery_s
         FROM event WHERE dog_id = ? AND deleted_at IS NULL ORDER BY ts, id`,
      [dogId],
    )
    .map((r): EventRow => ({
      typeId: String(r['type_id']),
      ts: fromIso(String(r['ts'])),
      tzOffsetMin: Number(r['tz_offset_min']),
      reaction: num(r['reaction']),
      distanceM: num(r['distance_m']),
      bucket: r['distance_bucket'] === null ? null : String(r['distance_bucket']),
      recoveryS: num(r['recovery_s']),
    }));
  const distances = types
    .filter((t) => t.kind === 'trigger')
    .flatMap((type) => {
      const series = reactionDistanceSeries(events.filter((e) => e.typeId === type.id));
      return series.weeks.length >= 2 ? [{ type, series }] : [];
    })
    .sort((a, b) => b.series.n - a.series.n);
  const hard = new Set(types.filter((t) => t.startsRecoveryTimer).map((t) => t.id));
  const recovery = recoverySeries(events.filter((e) => hard.has(e.typeId)));
  return { distances, recovery };
}
