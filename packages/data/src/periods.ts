import {
  comparePeriods,
  groupShares,
  groupSpreads,
  localDay,
  weeklyBars,
  type ChartWalk,
  type ComparisonRow,
  type PeriodWalk,
  type ShareBar,
  type SpreadBar,
  type WeekBar,
} from '@pawquest/insights';

import { MIN_ANALYSED_WALK_S, listWalkDims } from './derived';
import { fromIso, toIso } from './ids';
import type { SqlDb } from './sql';

const DAY = 86_400_000;

interface WalkNumbers {
  readonly id: string;
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
}

export function walkNumbers(db: SqlDb, dogId: string, fromTs: number, toTs: number): WalkNumbers[] {
  return db
    .all(
      `SELECT w.id, w.started_at, w.tz_offset_min, w.duration_s, w.distance_m
         FROM walk w JOIN walk_dog d ON d.walk_id = w.id
        WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
          AND (w.duration_s IS NULL OR w.duration_s >= ?)
          AND w.started_at >= ? AND w.started_at < ?
        ORDER BY w.started_at, w.id`,
      [dogId, MIN_ANALYSED_WALK_S, toIso(fromTs), toIso(toTs)],
    )
    .map((r) => ({
      id: String(r['id']),
      startedAt: fromIso(String(r['started_at'])),
      tzOffsetMin: Number(r['tz_offset_min']),
      durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
      distanceM: r['distance_m'] === null ? null : Number(r['distance_m']),
    }));
}

export interface Period {
  readonly fromTs: number;
  /** Exclusive. */
  readonly toTs: number;
}

export interface PeriodComparison {
  /** The later period and the one before it, of the same length. */
  readonly a: Period;
  readonly b: Period;
  readonly rows: ComparisonRow[];
}

/**
 * The last `days` days against the `days` before them (docs/23, step 3.9, S13-Cmp): equal lengths,
 * so totals can be set side by side. Outcomes come from the derived layer; a walk that is not
 * worked out yet has unknown outcomes and is not counted in the shares.
 */
export function periodComparison(
  db: SqlDb,
  dogId: string,
  now: number,
  days: number,
): PeriodComparison {
  const a = { fromTs: now - days * DAY, toTs: now + 1 };
  const b = { fromTs: now - 2 * days * DAY, toTs: now - days * DAY };
  const outcomes = new Map(listWalkDims(db, dogId).map((d) => [d.walkId, d.dims.outcomes]));
  const walks = (p: Period): PeriodWalk[] =>
    walkNumbers(db, dogId, p.fromTs, p.toTs).map((w) => ({
      startedAt: w.startedAt,
      durationS: w.durationS,
      distanceM: w.distanceM,
      hard: outcomes.get(w.id)?.['hard_moment'],
      success: outcomes.get(w.id)?.['success'],
    }));
  return { a, b, rows: comparePeriods(walks(a), walks(b)) };
}

const TEMP_ORDER = ['below_-10', '-10_0', '0_10', '10_20', '20_25', 'over_25'] as const;
const PLACE_ORDER = ['green', 'streets', 'water', 'errands', 'base'] as const;
const LIGHT_ORDER = ['day', 'twilight', 'dark'] as const;

export interface ChartData {
  /** Time walked per week, the last twelve weeks. */
  readonly weeks: readonly WeekBar[];
  /** How long walks lasted in each temperature band. */
  readonly tempBands: readonly SpreadBar[];
  /** The share of walks with a hard moment in each kind of place. */
  readonly placeKinds: readonly ShareBar[];
  /** The same by the light: day, twilight, dark. */
  readonly lightBands: readonly ShareBar[];
}

/** The data of the charts of the Insights tab. */
export function chartData(db: SqlDb, dogId: string, now: number, tzOffsetMin: number): ChartData {
  const dims = listWalkDims(db, dogId);
  const byId = new Map(dims.map((d) => [d.walkId, d.dims]));
  const all = walkNumbers(db, dogId, 0, now + DAY);
  const chartWalks: ChartWalk[] = all
    .filter((w) => w.startedAt >= now - 13 * 7 * DAY)
    .map((w) => ({
      startedAt: w.startedAt,
      tzOffsetMin: w.tzOffsetMin,
      durationS: w.durationS,
      ground: byId.get(w.id)?.dims['ground'],
    }));
  const durationById = new Map(all.map((w) => [w.id, w.durationS]));
  return {
    weeks: weeklyBars(chartWalks, localDay(now, tzOffsetMin), 12),
    tempBands: groupSpreads(
      dims.map((d) => ({ level: d.dims.dims['temp'], x: durationById.get(d.walkId) ?? null })),
      TEMP_ORDER,
    ),
    placeKinds: groupShares(
      dims.map((d) => d.dims),
      'place_kind',
      'hard_moment',
      PLACE_ORDER,
    ),
    lightBands: groupShares(
      dims.map((d) => d.dims),
      'light',
      'hard_moment',
      LIGHT_ORDER,
    ),
  };
}
