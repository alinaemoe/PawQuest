import { describe, expect, it } from 'vitest';

import { MIN_WEEK_ATTEMPTS, skillWeeks, type SkillAttempt } from './skillSeries';
import { localDay } from './time';

const DAY = 86_400_000;
const FRIDAY = Date.UTC(2026, 9, 16, 9);
const today = localDay(FRIDAY, 180);
const attempt = (dayOffset: number, result: SkillAttempt['result']): SkillAttempt => ({
  ts: FRIDAY + dayOffset * DAY,
  tzOffsetMin: 180,
  result,
});

describe('skillWeeks', () => {
  it('a row per week: attempts and the share of successes, a partial one counted as half', () => {
    const weeks = skillWeeks(
      [
        attempt(0, 'successful'),
        attempt(0, 'partial'),
        attempt(-1, 'unsuccessful'),
        attempt(-2, 'successful'),
        attempt(-9, 'successful'),
        attempt(-40, 'successful'),
      ],
      today,
      3,
    );
    expect(weeks).toHaveLength(3);
    expect(weeks[2]).toMatchObject({ attempts: 4, share: 0.625, enough: false });
    expect(weeks[2]?.interval?.n).toBe(4);
    expect(weeks[1]).toMatchObject({ attempts: 1, share: 1 });
    expect(weeks[0]).toMatchObject({ attempts: 0, share: null, interval: null });
  });

  it('five attempts in a week are enough to be told about; later days and no weeks are left out', () => {
    const five = Array.from({ length: MIN_WEEK_ATTEMPTS }, () => attempt(0, 'successful'));
    expect(skillWeeks(five, today, 1)[0]?.enough).toBe(true);
    expect(skillWeeks([attempt(3, 'successful')], today, 1)[0]?.attempts).toBe(0);
    expect(skillWeeks([], today, 0)).toEqual([]);
  });
});
