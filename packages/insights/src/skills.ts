import { median } from '@pawquest/core';

import { wilsonInterval, type AttemptResult, type ProportionInterval } from './proportion';
import { assertFinite, localDay } from './time';

/** A moment with the UTC offset in minutes at that moment. */
export interface Moment {
  readonly ts: number;
  readonly tzOffsetMin: number;
}

const DEFAULT_TYPICAL_DAYS = 3;
const MIN_PRACTICE_DAYS_FOR_RHYTHM = 4;
const MIN_OVERDUE_DAYS = 3;
const OVERDUE_FACTOR = 1.5;

export interface PracticeGap {
  /** Whole local days since the last practice day (never negative). */
  readonly daysSince: number;
  /** The owner's usual interval between practice days (default 3 until 4 days of history). */
  readonly typicalDays: number;
  readonly overdue: boolean;
}

/**
 * "Not practised for a while" (spec A-10, decision D-50). Rhythm is computed over distinct local
 * practice days; the skill is overdue when the days since the last practice exceed
 * max(1.5 * typical, 3). Returns null when the skill has never been practised.
 *
 * @throws RangeError for non-finite times or offsets.
 */
export function practiceGap(sessions: readonly Moment[], now: Moment): PracticeGap | null {
  assertFinite('now', now.ts, now.tzOffsetMin);
  for (const s of sessions) {
    assertFinite('session', s.ts, s.tzOffsetMin);
  }
  const days = [...new Set(sessions.map((s) => localDay(s.ts, s.tzOffsetMin)))].sort(
    (a, b) => a - b,
  );
  const lastDay = days[days.length - 1];
  if (lastDay === undefined) {
    return null;
  }

  let typicalDays = DEFAULT_TYPICAL_DAYS;
  if (days.length >= MIN_PRACTICE_DAYS_FOR_RHYTHM) {
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) {
      gaps.push((days[i] ?? 0) - (days[i - 1] ?? 0));
    }
    typicalDays = median(gaps);
  }
  const daysSince = Math.max(0, localDay(now.ts, now.tzOffsetMin) - lastDay);
  const overdue = daysSince > Math.max(OVERDUE_FACTOR * typicalDays, MIN_OVERDUE_DAYS);
  return { daysSince, typicalDays, overdue };
}

/** One training attempt on the skill's current level. */
export interface LevelAttempt extends Moment {
  readonly result: AttemptResult;
  /** Where it happened (home, yard, park, street, ...). */
  readonly context: string;
}

export type NotReadyReason =
  'not_enough_attempts' | 'share_below_threshold' | 'single_context_and_day';

export interface LevelReadiness {
  readonly ready: boolean;
  /** How many attempts were considered (at most 10). */
  readonly n: number;
  /** Share of successes with a partial attempt counted as 0.5. */
  readonly share: number | null;
  /** Wilson interval of the share, shown to the user next to the hint. */
  readonly interval: ProportionInterval | null;
  readonly contexts: number;
  readonly days: number;
  readonly reasons: readonly NotReadyReason[];
}

const WINDOW_ATTEMPTS = 10;
const READY_SHARE = 0.8;

/**
 * Readiness for the next level (spec A-11, decision D-50): the last 10 attempts must reach a
 * success share of at least 0.8 (partial = 0.5) and come from at least two contexts or two days.
 * Only a hint: the decision to move up always stays with the owner.
 *
 * @throws RangeError for non-finite times or offsets.
 */
export function levelReadiness(attempts: readonly LevelAttempt[]): LevelReadiness {
  for (const a of attempts) {
    assertFinite('attempt', a.ts, a.tzOffsetMin);
  }
  const recent = [...attempts].sort((a, b) => a.ts - b.ts).slice(-WINDOW_ATTEMPTS);
  const n = recent.length;
  const successes = recent.reduce(
    (sum, a) => sum + (a.result === 'successful' ? 1 : a.result === 'partial' ? 0.5 : 0),
    0,
  );
  const interval = wilsonInterval(successes, n);
  const share = n === 0 ? null : successes / n;
  const contexts = new Set(recent.map((a) => a.context)).size;
  const days = new Set(recent.map((a) => localDay(a.ts, a.tzOffsetMin))).size;

  const reasons: NotReadyReason[] = [];
  if (n < WINDOW_ATTEMPTS) {
    reasons.push('not_enough_attempts');
  }
  if (share === null || share < READY_SHARE) {
    reasons.push('share_below_threshold');
  }
  if (contexts < 2 && days < 2) {
    reasons.push('single_context_and_day');
  }
  return { ready: reasons.length === 0, n, share, interval, contexts, days, reasons };
}
