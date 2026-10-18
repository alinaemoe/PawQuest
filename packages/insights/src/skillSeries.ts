import { mondayOf } from './calendar';
import { wilsonInterval, type AttemptResult, type ProportionInterval } from './proportion';
import { localDay } from './time';

/**
 * Practice of a skill week by week (docs/23, step 3.14): how many attempts and what share of
 * them went well. A partial attempt counts as half. Nothing here sets a bar to reach: training is
 * as it comes, and the share is a description of what happened, not a mark.
 */

/** A week with fewer attempts than this is shown, but marked "few". */
export const MIN_WEEK_ATTEMPTS = 5;

export interface SkillAttempt {
  readonly ts: number;
  readonly tzOffsetMin: number;
  readonly result: AttemptResult;
}

export interface SkillWeek {
  readonly mondayDay: number;
  readonly attempts: number;
  /** The share of successes (a partial attempt is half); null in a week without attempts. */
  readonly share: number | null;
  readonly interval: ProportionInterval | null;
  readonly enough: boolean;
}

const score = (result: AttemptResult): number =>
  result === 'successful' ? 1 : result === 'partial' ? 0.5 : 0;

/** The last `weeks` weeks (the one of `today` last); a week with no attempts has no share. */
export function skillWeeks(
  attempts: readonly SkillAttempt[],
  today: number,
  weeks: number,
): SkillWeek[] {
  const firstMonday = mondayOf(today) - (weeks - 1) * 7;
  const buckets = Array.from({ length: Math.max(0, weeks) }, () => ({ n: 0, points: 0 }));
  for (const attempt of attempts) {
    const day = localDay(attempt.ts, attempt.tzOffsetMin);
    if (day > today || mondayOf(day) < firstMonday) {
      continue;
    }
    const bucket = buckets[Math.floor((mondayOf(day) - firstMonday) / 7)];
    if (bucket !== undefined) {
      bucket.n += 1;
      bucket.points += score(attempt.result);
    }
  }
  return buckets.map((b, i) => ({
    mondayDay: firstMonday + i * 7,
    attempts: b.n,
    share: b.n === 0 ? null : b.points / b.n,
    interval: wilsonInterval(b.points, b.n),
    enough: b.n >= MIN_WEEK_ATTEMPTS,
  }));
}
