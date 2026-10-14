import { describe, expect, it } from 'vitest';

import type { AttemptResult } from './proportion';
import { levelReadiness, practiceGap, type LevelAttempt, type Moment } from './skills';

const DAY = 86_400_000;
/** A moment at noon UTC of day number `d` (days since 1970-01-01). */
const noon = (d: number): Moment => ({ ts: d * DAY + 12 * 3_600_000, tzOffsetMin: 0 });

describe('practiceGap (A-10)', () => {
  it('is null for a skill that was never practised', () => {
    expect(practiceGap([], noon(100))).toBeNull();
  });

  it('uses the default typical interval of 3 days before 4 practice days exist', () => {
    const r = practiceGap([noon(10), noon(12), noon(14)], noon(20));
    expect(r?.typicalDays).toBe(3);
    expect(r?.daysSince).toBe(6);
    expect(r?.overdue).toBe(true); // 6 > max(4.5, 3)
  });

  it('derives the typical interval as the median gap once there are 4 practice days', () => {
    // practice days 10, 12, 14, 16: gaps 2, 2, 2 -> typical 2, threshold max(3, 3) = 3
    const sessions = [noon(10), noon(12), noon(14), noon(16)];
    expect(practiceGap(sessions, noon(19))).toMatchObject({
      typicalDays: 2,
      daysSince: 3,
      overdue: false,
    });
    expect(practiceGap(sessions, noon(20))).toMatchObject({ daysSince: 4, overdue: true });
  });

  it('scales the threshold with the rhythm: typical 4 days means overdue after 6', () => {
    const sessions = [noon(0), noon(4), noon(8), noon(12)];
    expect(practiceGap(sessions, noon(18))?.overdue).toBe(false); // 6 days: not strictly more
    expect(practiceGap(sessions, noon(19))?.overdue).toBe(true);
  });

  it('merges several sessions of one day into one practice day', () => {
    const sameDay = [noon(10), { ts: noon(10).ts + 3_600_000, tzOffsetMin: 0 }, noon(11)];
    // only 2 distinct days -> still the default rhythm of 3
    expect(practiceGap(sameDay, noon(12))?.typicalDays).toBe(3);
  });

  it('works on unsorted input and never reports negative days', () => {
    expect(practiceGap([noon(14), noon(10), noon(12), noon(16)], noon(16))?.daysSince).toBe(0);
    expect(practiceGap([noon(50)], noon(40))?.daysSince).toBe(0);
  });

  it('uses the local day of each moment', () => {
    // 22:00 UTC at +03:00 is already the next local day.
    const late: Moment = { ts: 10 * DAY + 22 * 3_600_000, tzOffsetMin: 180 };
    expect(practiceGap([late], { ts: 12 * DAY + 3_600_000, tzOffsetMin: 180 })?.daysSince).toBe(1);
  });

  it('rejects non-finite input', () => {
    expect(() => practiceGap([{ ts: Number.NaN, tzOffsetMin: 0 }], noon(1))).toThrow(RangeError);
    expect(() => practiceGap([], { ts: 0, tzOffsetMin: Number.NaN })).toThrow(RangeError);
  });
});

function attempt(index: number, result: AttemptResult, context = 'park', day = 0): LevelAttempt {
  return { ts: day * DAY + index * 60_000, tzOffsetMin: 0, result, context };
}

/** `successes` successful attempts followed by failures, total `n`, in the given context/day. */
function batch(n: number, successes: number, context = 'park', day = 0): LevelAttempt[] {
  return Array.from({ length: n }, (_, i) =>
    attempt(i, i < successes ? 'successful' : 'unsuccessful', context, day),
  );
}

describe('levelReadiness (A-11)', () => {
  it('needs 10 attempts', () => {
    const r = levelReadiness(batch(9, 9));
    expect(r.ready).toBe(false);
    expect(r.reasons).toContain('not_enough_attempts');
    expect(r.n).toBe(9);
  });

  it('is ready with 8 of 10 successes in two contexts', () => {
    const attempts = [...batch(5, 4, 'park'), ...batch(5, 4, 'yard')].map((a, i) => ({
      ...a,
      ts: i * 60_000,
    }));
    const r = levelReadiness(attempts);
    expect(r.ready).toBe(true);
    expect(r.share).toBe(0.8);
    expect(r.interval?.low).toBeGreaterThan(0);
    expect(r.reasons).toEqual([]);
  });

  it('counts partial attempts as 0.5: 7 successes + 2 partial + 1 failure is exactly 0.8', () => {
    const results: AttemptResult[] = [
      ...Array<AttemptResult>(7).fill('successful'),
      'partial',
      'partial',
      'unsuccessful',
    ];
    const attempts = results.map((result, i) => attempt(i, result, i % 2 === 0 ? 'park' : 'yard'));
    expect(levelReadiness(attempts)).toMatchObject({ ready: true, share: 0.8 });
  });

  it('is not ready just below 0.8 (7 of 10 and 7.5 of 10)', () => {
    expect(
      levelReadiness(batch(10, 7, 'park').map((a, i) => (i % 2 ? { ...a, context: 'yard' } : a)))
        .reasons,
    ).toEqual(['share_below_threshold']);
    const results: AttemptResult[] = [
      ...Array<AttemptResult>(7).fill('successful'),
      'partial',
      'unsuccessful',
      'unsuccessful',
    ];
    const r = levelReadiness(results.map((result, i) => attempt(i, result, i % 2 ? 'a' : 'b')));
    expect(r.share).toBe(0.75);
    expect(r.ready).toBe(false);
  });

  it('is not ready when everything happened in one context on one day', () => {
    const r = levelReadiness(batch(10, 10));
    expect(r.ready).toBe(false);
    expect(r.reasons).toEqual(['single_context_and_day']);
  });

  it('is ready with one context if the attempts span two days', () => {
    const attempts = [...batch(5, 5, 'park', 0), ...batch(5, 5, 'park', 1)];
    expect(levelReadiness(attempts)).toMatchObject({ ready: true, contexts: 1, days: 2 });
  });

  it('looks only at the last 10 attempts', () => {
    const old = batch(10, 0, 'park', 0); // ten failures long ago
    const recent = [...batch(5, 5, 'park', 5), ...batch(5, 5, 'yard', 5)].map((a, i) => ({
      ...a,
      ts: 5 * DAY + i * 60_000,
    }));
    expect(levelReadiness([...recent, ...old]).ready).toBe(true);
  });

  it('handles no attempts and non-finite input', () => {
    expect(levelReadiness([])).toMatchObject({ ready: false, n: 0, share: null, interval: null });
    expect(() => levelReadiness([{ ...attempt(0, 'successful'), ts: Number.NaN }])).toThrow(
      RangeError,
    );
  });
});
