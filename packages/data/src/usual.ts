import { weatherDimensions, type WeatherFacts } from '@pawquest/weather';
import {
  MIN_SIMILAR,
  SIMILAR_WEATHER_LEVELS,
  compareToUsual,
  similarWalks,
  usualStats,
  type SimilarityLevel,
  type UsualComparison,
  type UsualRule,
  type UsualStats,
} from '@pawquest/insights';

import { MIN_ANALYSED_WALK_S, listWalkDims } from './derived';
import type { SqlDb } from './sql';

/** The measures a walk is compared with its like by. */
export type UsualMeasure = 'duration' | 'distance' | 'pace';

export interface UsualMetric {
  readonly value: number;
  readonly usual: UsualStats;
  readonly comparison: UsualComparison;
}

export interface WalkUsual {
  readonly walkId: string;
  /** What the walks compared with have in common with this one (empty: any walk). */
  readonly keys: SimilarityLevel;
  /** A wider circle than "same kind of place and same kind of walk" had to be used. */
  readonly widened: boolean;
  /** How many walks make the circle. */
  readonly circleSize: number;
  readonly duration: UsualMetric | null;
  readonly distance: UsualMetric | null;
  readonly pace: UsualMetric | null;
}

/** What counts as "the same" for each measure: seconds, meters and minutes per kilometer. */
export const USUAL_RULES: Readonly<Record<UsualMeasure, UsualRule>> = {
  duration: { floor: 120 },
  distance: { floor: 100 },
  pace: { floor: 0.5 },
};

/** A pace needs this much distance to mean something (A-04). */
const MIN_PACE_DISTANCE_M = 200;

interface Numbers {
  readonly id: string;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly paceMinKm: number | null;
}

function numbersOfWalks(db: SqlDb, dogId: string): Map<string, Numbers> {
  const rows = db.all(
    `SELECT w.id, w.duration_s, w.distance_m, w.moving_s
       FROM walk w JOIN walk_dog d ON d.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND (w.duration_s IS NULL OR w.duration_s >= ?)`,
    [dogId, MIN_ANALYSED_WALK_S],
  );
  return new Map(
    rows.map((r) => {
      const distance = r['distance_m'] === null ? null : Number(r['distance_m']);
      const moving = r['moving_s'] === null ? null : Number(r['moving_s']);
      const pace =
        distance !== null && moving !== null && distance >= MIN_PACE_DISTANCE_M && moving > 0
          ? moving / 60 / (distance / 1000)
          : null;
      return [
        String(r['id']),
        {
          id: String(r['id']),
          durationS: r['duration_s'] === null ? null : Number(r['duration_s']),
          distanceM: distance !== null && distance > 0 ? distance : null,
          paceMinKm: pace,
        },
      ];
    }),
  );
}

function metric(
  value: number | null,
  others: readonly (number | null)[],
  rule: UsualRule,
): UsualMetric | null {
  const values = others.filter((v): v is number => v !== null);
  if (value === null || values.length < MIN_SIMILAR) {
    return null;
  }
  const usual = usualStats(values);
  return usual === null ? null : { value, usual, comparison: compareToUsual(value, usual, rule) };
}

/**
 * How a finished walk stands against walks like it (A-30): duration, distance and pace against the
 * usual of the same kind of place and walk, widened (and said so) when there are too few. `null`
 * when the walk is not worked out yet, or when no circle has enough walks. A measure the circle
 * does not have enough values for is left out, not guessed.
 */
export function walkUsual(db: SqlDb, dogId: string, walkId: string): WalkUsual | null {
  const dims = listWalkDims(db, dogId);
  const target = dims.find((d) => d.walkId === walkId);
  if (target === undefined) {
    return null;
  }
  const all = dims.map((d) => ({ id: d.walkId, startedAt: d.startedAt, dims: d.dims.dims }));
  const targetWalk = all.find((w) => w.id === walkId);
  if (targetWalk === undefined) {
    return null;
  }
  const circle = similarWalks(all, targetWalk);
  if (circle === null) {
    return null;
  }
  const numbers = numbersOfWalks(db, dogId);
  const mine = numbers.get(walkId);
  const others = circle.walks.map((w) => numbers.get(w.id));
  const pick = (read: (n: Numbers) => number | null): (number | null)[] =>
    others.map((n) => (n === undefined ? null : read(n)));
  return {
    walkId,
    keys: circle.keys,
    widened: circle.widened,
    circleSize: circle.walks.length,
    duration: metric(
      mine?.durationS ?? null,
      pick((n) => n.durationS),
      USUAL_RULES.duration,
    ),
    distance: metric(
      mine?.distanceM ?? null,
      pick((n) => n.distanceM),
      USUAL_RULES.distance,
    ),
    pace: metric(
      mine?.paceMinKm ?? null,
      pick((n) => n.paceMinKm),
      USUAL_RULES.pace,
    ),
  };
}

export interface WeatherUsual {
  /** The weather the comparison was made in: the dimensions the walks share with the conditions. */
  readonly keys: SimilarityLevel;
  /** The values of those dimensions now ("wet", "0_10"). */
  readonly values: Readonly<Record<string, string>>;
  readonly widened: boolean;
  /** How many walks were in weather like this. */
  readonly circleSize: number;
  /** How long walks lasted in such weather, in seconds: the usual with its spread. */
  readonly duration: UsualStats | null;
}

/**
 * "In weather like today's": the walks of a dog that were made in weather like the given
 * conditions (the same ground, temperature band and light; wider when there are too few) and how
 * long they usually lasted. `null` when fewer than five walks are like it.
 */
export function weatherUsual(db: SqlDb, dogId: string, facts: WeatherFacts): WeatherUsual | null {
  const dims = weatherDimensions(facts);
  const target = {
    id: 'now',
    startedAt: Number.MAX_SAFE_INTEGER,
    dims: { ground: dims.ground, temp: dims.temp, light: dims.light },
  };
  const all = listWalkDims(db, dogId).map((d) => ({
    id: d.walkId,
    startedAt: d.startedAt,
    dims: d.dims.dims,
  }));
  const circle = similarWalks(all, target, SIMILAR_WEATHER_LEVELS);
  if (circle === null) {
    return null;
  }
  const numbers = numbersOfWalks(db, dogId);
  const durations = circle.walks.flatMap((w) => numbers.get(w.id)?.durationS ?? []);
  return {
    keys: circle.keys,
    values: Object.fromEntries(
      circle.keys.map((k) => [k, target.dims[k as 'ground' | 'temp' | 'light']]),
    ),
    widened: circle.widened,
    circleSize: circle.walks.length,
    duration: durations.length >= MIN_SIMILAR ? usualStats(durations) : null,
  };
}
