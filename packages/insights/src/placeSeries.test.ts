import { describe, expect, it } from 'vitest';

import { MIN_PLACE_WALKS, placeSummary, placeWeeks, type PlaceWalk } from './placeSeries';
import { localDay } from './time';

const DAY = 86_400_000;
const FRIDAY = Date.UTC(2026, 9, 16, 9);
const today = localDay(FRIDAY, 180);
const walk = (dayOffset: number, minutes: number | null, events = 0): PlaceWalk => ({
  startedAt: FRIDAY + dayOffset * DAY,
  tzOffsetMin: 180,
  durationS: minutes === null ? null : minutes * 60,
  events,
});

describe('placeWeeks', () => {
  it('a row per week, the week of today last: count, typical length, events', () => {
    const weeks = placeWeeks(
      [walk(0, 30, 2), walk(-1, 50, 1), walk(-2, 40), walk(-9, 20), walk(-40, 99)],
      today,
      3,
    );
    expect(weeks).toHaveLength(3);
    expect(weeks[2]).toMatchObject({ walks: 3, medianS: 40 * 60, events: 3 });
    expect(weeks[1]).toMatchObject({ walks: 1, medianS: 20 * 60, events: 0 });
    expect(weeks[0]).toMatchObject({ walks: 0, medianS: null, events: 0 });
    expect(weeks.map((w) => w.mondayDay)).toEqual([today - 4 - 14, today - 4 - 7, today - 4]);
  });

  it('walks after today or outside the weeks are left out; an unknown length adds no median', () => {
    const weeks = placeWeeks([walk(3, 30), walk(0, null)], today, 2);
    expect(weeks[1]).toMatchObject({ walks: 1, medianS: null });
    expect(placeWeeks([], today, 0)).toEqual([]);
  });
});

describe('placeSummary', () => {
  it('count, total, typical length, events, the last time, and whether it is enough', () => {
    const few = placeSummary([walk(-3, 30, 1), walk(-1, 50)]);
    expect(few).toMatchObject({ walks: 2, totalS: 4800, medianS: 2400, events: 1, enough: false });
    expect(few.lastAt).toBe(FRIDAY - DAY);
    const many = placeSummary(Array.from({ length: MIN_PLACE_WALKS }, (_, i) => walk(-i, 30)));
    expect(many.enough).toBe(true);
  });

  it('no walks is an empty summary', () => {
    expect(placeSummary([])).toEqual({
      walks: 0,
      totalS: 0,
      medianS: null,
      events: 0,
      lastAt: null,
      enough: false,
    });
  });
});
