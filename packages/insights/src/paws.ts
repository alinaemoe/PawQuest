/** Most paws that can be earned in one local day (spec 07, A-21). */
export const DAILY_PAW_CAP = 100;
/** Event paws per walk are capped at this many. */
export const MAX_EVENT_PAWS_PER_WALK = 20;
/** Attempt paws per training session are capped at this many. */
export const MAX_ATTEMPT_PAWS_PER_SESSION = 10;

/**
 * Paws actually granted for a reward, respecting the daily cap:
 * min(requested, cap - alreadyGrantedToday), never below 0.
 *
 * @throws RangeError for negative or non-finite numbers.
 */
export function grantPaws(
  requested: number,
  alreadyGrantedToday: number,
  cap: number = DAILY_PAW_CAP,
): number {
  for (const value of [requested, alreadyGrantedToday, cap]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('paw amounts must be finite numbers >= 0');
    }
  }
  return Math.max(0, Math.min(requested, cap - alreadyGrantedToday));
}

/** +1 paw per recorded event on a walk, at most 20 per walk. */
export function eventPaws(eventsOnWalk: number): number {
  if (!Number.isInteger(eventsOnWalk) || eventsOnWalk < 0) {
    throw new RangeError('eventsOnWalk must be an integer >= 0');
  }
  return Math.min(MAX_EVENT_PAWS_PER_WALK, eventsOnWalk);
}

/** +1 paw per two attempts in a training session, at most 10 per session. */
export function attemptPaws(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new RangeError('attempts must be an integer >= 0');
  }
  return Math.min(MAX_ATTEMPT_PAWS_PER_SESSION, Math.floor(attempts / 2));
}

export type PawLevelKey =
  'puppy_step' | 'tracker' | 'observer' | 'companion' | 'expert' | 'trail_veteran';

/** Levels by total paws; they never go back down. */
export const PAW_LEVELS: readonly { readonly key: PawLevelKey; readonly from: number }[] = [
  { key: 'puppy_step', from: 0 },
  { key: 'tracker', from: 200 },
  { key: 'observer', from: 600 },
  { key: 'companion', from: 1500 },
  { key: 'expert', from: 3500 },
  { key: 'trail_veteran', from: 7500 },
];

export interface PawLevel {
  readonly index: number;
  readonly key: PawLevelKey;
  /** Total paws needed to reach the next level; null at the top level. */
  readonly nextAt: number | null;
  /** Progress to the next level in [0, 1]; 1 at the top level. */
  readonly progress: number;
}

/**
 * Level for a total of paws.
 *
 * @throws RangeError if `total` is not a finite number >= 0.
 */
export function pawLevel(total: number): PawLevel {
  if (!Number.isFinite(total) || total < 0) {
    throw new RangeError('total must be a finite number >= 0');
  }
  let index = 0;
  PAW_LEVELS.forEach((level, i) => {
    if (total >= level.from) {
      index = i;
    }
  });
  const current = PAW_LEVELS[index];
  const next = PAW_LEVELS[index + 1];
  if (current === undefined) {
    throw new Error('no paw levels defined');
  }
  if (next === undefined) {
    return { index, key: current.key, nextAt: null, progress: 1 };
  }
  return {
    index,
    key: current.key,
    nextAt: next.from,
    progress: (total - current.from) / (next.from - current.from),
  };
}
