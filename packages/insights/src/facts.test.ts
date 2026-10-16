import { describe, expect, it } from 'vitest';

import {
  MIN_WALKS_FOR_FAVOURITES,
  MIN_WALKS_FOR_RECORDS,
  computeFacts,
  weekdayOf,
  type FactWalk,
} from './facts';
import { localDay } from './time';

const DAY = 86_400_000;
// Monday 12 Oct 2026, 08:00 in Minsk (UTC+3)
const MONDAY = Date.UTC(2026, 9, 12, 5, 0);
const TZ = 180;

let counter = 0;
function walk(dayOffset: number, extra: Partial<FactWalk> = {}): FactWalk {
  counter += 1;
  return {
    id: `w${String(counter)}`,
    startedAt: MONDAY + dayOffset * DAY,
    tzOffsetMin: TZ,
    durationS: 1800,
    distanceM: 2000,
    placeId: null,
    timeOfDay: 'morning',
    calmMs: null,
    ...extra,
  };
}

describe('weekdayOf', () => {
  it('counts from Monday by the local day', () => {
    expect([0, 1, 5, 6, 7].map((d) => weekdayOf(MONDAY + d * DAY, TZ))).toEqual([0, 1, 5, 6, 0]);
    // Sunday 22:00 UTC is already Monday in Minsk
    expect(weekdayOf(Date.UTC(2026, 9, 18, 22), TZ)).toBe(0);
    expect(weekdayOf(Date.UTC(2026, 9, 18, 22), 0)).toBe(6);
    expect(weekdayOf(Date.UTC(1969, 11, 28, 12), 0)).toBe(6);
  });
});

describe('computeFacts: totals', () => {
  it('adds up the walks, skipping what is not known', () => {
    const facts = computeFacts(
      [walk(0), walk(1, { durationS: null, distanceM: null }), walk(2, { distanceM: 500 })],
      MONDAY,
      TZ,
    );
    expect(facts.totals).toEqual({
      walks: 3,
      durationS: 3600,
      distanceM: 2500,
      firstAt: MONDAY,
      lastAt: MONDAY + 2 * DAY,
    });
  });

  it('no walks, no facts', () => {
    const facts = computeFacts([], MONDAY, TZ);
    expect(facts.totals).toEqual({
      walks: 0,
      durationS: 0,
      distanceM: 0,
      firstAt: null,
      lastAt: null,
    });
    expect(facts.favouritePlaces).toBeNull();
    expect(facts.longestWalk).toBeNull();
    expect(facts.streak).toBeNull();
    expect(facts.busiestWeek).toBeNull();
  });
});

describe('favourites', () => {
  const walks = (count: number, extra: (i: number) => Partial<FactWalk>) =>
    Array.from({ length: count }, (_, i) => walk(i, extra(i)));

  it('need enough walks', () => {
    expect(
      computeFacts(
        walks(MIN_WALKS_FOR_FAVOURITES - 1, () => ({ placeId: 'p' })),
        MONDAY,
        TZ,
      ).favouritePlaces,
    ).toBeNull();
    expect(
      computeFacts(
        walks(MIN_WALKS_FOR_FAVOURITES, () => ({ placeId: 'p' })),
        MONDAY,
        TZ,
      ).favouritePlaces,
    ).toEqual({
      values: ['p'],
      count: 5,
      of: 5,
    });
  });

  it('the place with most walks, counting only walks that have a place', () => {
    const facts = computeFacts(
      walks(8, (i) => ({ placeId: i < 3 ? 'park' : i < 5 ? 'yard' : null })),
      MONDAY,
      TZ,
    );
    expect(facts.favouritePlaces).toEqual({ values: ['park'], count: 3, of: 5 });
  });

  it('ties are all named, never one picked', () => {
    const facts = computeFacts(
      walks(6, (i) => ({
        placeId: i % 2 === 0 ? 'park' : 'yard',
        timeOfDay: i % 2 === 0 ? 'morning' : 'evening',
      })),
      MONDAY,
      TZ,
    );
    expect(facts.favouritePlaces?.values.slice().sort()).toEqual(['park', 'yard']);
    expect(facts.favouriteTimeOfDay?.values.slice().sort()).toEqual(['evening', 'morning']);
  });

  it('time of day and weekday', () => {
    const facts = computeFacts(
      walks(10, (i) => ({ timeOfDay: i < 6 ? 'evening' : 'morning' })),
      MONDAY,
      TZ,
    );
    expect(facts.favouriteTimeOfDay).toEqual({ values: ['evening'], count: 6, of: 10 });
    // ten days from Monday: Monday, Tuesday and Wednesday twice
    expect(facts.favouriteWeekdays?.values.slice().sort()).toEqual([0, 1, 2]);
    expect(facts.favouriteWeekdays?.count).toBe(2);
  });
});

describe('records', () => {
  it('need enough walks', () => {
    expect(computeFacts([walk(0), walk(1)], MONDAY, TZ).longestWalk).toBeNull();
    expect(computeFacts([walk(0), walk(1), walk(2)], MONDAY, TZ).longestWalk).not.toBeNull();
    expect(MIN_WALKS_FOR_RECORDS).toBe(3);
  });

  it('the longest, the farthest and the calmest, with the walks that hold them', () => {
    const a = walk(0, { durationS: 3600, distanceM: 1000, calmMs: 600_000 });
    const b = walk(1, { durationS: 1200, distanceM: 5000, calmMs: 1_800_000 });
    const c = walk(2, { durationS: 900, distanceM: 800, calmMs: null });
    const facts = computeFacts([a, b, c], MONDAY, TZ);
    expect(facts.longestWalk).toEqual({ walkIds: [a.id], value: 3600 });
    expect(facts.farthestWalk).toEqual({ walkIds: [b.id], value: 5000 });
    expect(facts.longestCalm).toEqual({ walkIds: [b.id], value: 1_800_000 });
  });

  it('a tie names every walk; zero and unknown are no record', () => {
    const a = walk(0, { durationS: 1800 });
    const b = walk(1, { durationS: 1800 });
    const c = walk(2, { durationS: 600, distanceM: null });
    const facts = computeFacts([a, b, c], MONDAY, TZ);
    expect(facts.longestWalk?.walkIds).toEqual([a.id, b.id]);
    const none = computeFacts(
      [
        walk(0, { distanceM: 0, durationS: null }),
        walk(1, { distanceM: null, durationS: 0 }),
        walk(2, { distanceM: 0, durationS: null }),
      ],
      MONDAY,
      TZ,
    );
    expect(none.farthestWalk).toBeNull();
    expect(none.longestWalk).toBeNull();
  });

  it('the busiest week: the most walks, the Monday it began, how many weeks tie', () => {
    // week of 12 Oct: 3 walks; week of 19 Oct: 3 walks; week of 26 Oct: 1
    const facts = computeFacts(
      [walk(0), walk(1), walk(2), walk(7), walk(8), walk(9), walk(14)],
      MONDAY,
      TZ,
    );
    expect(facts.busiestWeek?.walks).toBe(3);
    expect(facts.busiestWeek?.tied).toBe(2);
    expect(facts.busiestWeek?.weekStartDay).toBe(localDay(MONDAY + 7 * DAY, TZ));
    const one = computeFacts([walk(0), walk(1), walk(2)], MONDAY, TZ);
    expect(one.busiestWeek).toBeNull(); // one week is not a comparison
  });
});

describe('the run of days', () => {
  it('the longest run and the one that is still going', () => {
    const facts = computeFacts(
      [walk(0), walk(1), walk(2), walk(2), walk(5), walk(6), walk(7), walk(8), walk(9)],
      MONDAY + 9 * DAY,
      TZ,
    );
    expect(facts.streak).toEqual({ best: 5, current: 5 });
  });

  it('a run that ended before yesterday is not current', () => {
    const facts = computeFacts([walk(0), walk(1), walk(2)], MONDAY + 4 * DAY, TZ);
    expect(facts.streak).toEqual({ best: 3, current: 0 });
    expect(computeFacts([walk(0), walk(1), walk(2)], MONDAY + 3 * DAY, TZ).streak?.current).toBe(3);
  });

  it('two walks on one day are one day', () => {
    expect(computeFacts([walk(0), walk(0), walk(0)], MONDAY, TZ).streak).toEqual({
      best: 1,
      current: 1,
    });
  });
});
