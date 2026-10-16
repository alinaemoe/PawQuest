import { describe, expect, it } from 'vitest';

import {
  WALK_DIMENSIONS_VERSION,
  WALK_DIMENSION_KEYS,
  WALK_OUTCOME_KEYS,
  walkDimensions,
  walkOutcomes,
  type WalkDimensionInput,
} from './dimensions';

// Friday 16 Oct 2026 07:30 in Minsk (UTC+3)
const FRIDAY = Date.UTC(2026, 9, 16, 4, 30);
const MINSK = 180;

const input = (extra: Partial<WalkDimensionInput> = {}): WalkDimensionInput => ({
  startedAt: FRIDAY,
  tzOffsetMin: MINSK,
  durationS: 1800,
  placeCategory: 'park',
  placeRadiusM: 300,
  startPlaceCategory: 'home',
  endPlaceCategory: 'home',
  shopVisit: false,
  rideS: 0,
  hasTrack: true,
  ...extra,
});

describe('walkDimensions', () => {
  it('a half-hour morning walk in a park from home to home', () => {
    expect(walkDimensions(input())).toEqual({
      time_of_day: 'morning',
      day_type: 'weekday',
      duration: '20_45',
      place_kind: 'green',
      place_size: 'large',
      walk_type: 'base_to_base',
      shop_visit: 'no',
      ride: 'no',
    });
  });

  it('time of day follows local time, with each edge in the later part', () => {
    const at = (h: number, m = 0) =>
      walkDimensions(input({ startedAt: Date.UTC(2026, 9, 16, h - 3, m) })).time_of_day;
    expect([
      at(4, 59),
      at(5),
      at(10, 59),
      at(11),
      at(16, 59),
      at(17),
      at(21, 59),
      at(22),
      at(0),
    ]).toEqual([
      'night',
      'morning',
      'morning',
      'day',
      'day',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });

  it('the same moment is another day part in another zone', () => {
    expect(walkDimensions(input({ tzOffsetMin: 0 })).time_of_day).toBe('night');
    expect(walkDimensions(input({ tzOffsetMin: -480 })).time_of_day).toBe('evening'); // 20:30 the day before
  });

  it('weekday or weekend by the local day: Sunday night UTC is Monday in Minsk', () => {
    const day = (ts: number, tz: number) =>
      walkDimensions(input({ startedAt: ts, tzOffsetMin: tz })).day_type;
    expect(day(Date.UTC(2026, 9, 17, 9), MINSK)).toBe('weekend'); // Saturday
    expect(day(Date.UTC(2026, 9, 18, 20), MINSK)).toBe('weekend'); // Sunday evening
    expect(day(Date.UTC(2026, 9, 18, 22), MINSK)).toBe('weekday'); // Monday 01:00 in Minsk
    expect(day(Date.UTC(2026, 9, 18, 22), 0)).toBe('weekend');
    expect(day(Date.UTC(1969, 11, 28, 12), 0)).toBe('weekend'); // before 1970: Sunday
  });

  it('duration bands, each lower edge in the longer band; unknown duration gives none', () => {
    const d = (min: number | null) =>
      walkDimensions(input({ durationS: min === null ? null : min * 60 })).duration;
    expect([d(19.9), d(20), d(44.9), d(45), d(89.9), d(90), d(null)]).toEqual([
      'under_20',
      '20_45',
      '20_45',
      '45_90',
      '45_90',
      'over_90',
      undefined,
    ]);
  });

  it('place kinds are grouped, an unknown or missing place has no group', () => {
    const k = (c: string | null) => walkDimensions(input({ placeCategory: c })).place_kind;
    expect([
      k('park'),
      k('meadow'),
      k('yard'),
      k('busy_street'),
      k('waterfront'),
      k('vet'),
      k('home'),
    ]).toEqual(['green', 'green', 'streets', 'streets', 'water', 'errands', 'base']);
    expect(k('other')).toBeUndefined();
    expect(k('strange')).toBeUndefined();
    expect(k(null)).toBeUndefined();
  });

  it('place size by radius: 60 and 250 m belong to the smaller band', () => {
    const s = (r: number | null) => walkDimensions(input({ placeRadiusM: r })).place_size;
    expect([s(40), s(60), s(61), s(250), s(251), s(null)]).toEqual([
      'small',
      'small',
      'medium',
      'medium',
      'large',
      undefined,
    ]);
  });

  it('the kind of walk by the places at its ends', () => {
    const t = (start: string | null, end: string | null, hasTrack = true) =>
      walkDimensions(input({ startPlaceCategory: start, endPlaceCategory: end, hasTrack }))
        .walk_type;
    expect(t('home', 'guests')).toBe('base_to_base');
    expect(t('guests', 'yard')).toBe('from_base');
    expect(t('yard', 'home')).toBe('to_base');
    expect(t(null, null)).toBe('other');
    expect(t('home', 'home', false)).toBeUndefined();
  });

  it('shop visit and ride: unknown without a track, a ride from a minute', () => {
    expect(walkDimensions(input({ shopVisit: true })).shop_visit).toBe('yes');
    expect(walkDimensions(input({ shopVisit: null })).shop_visit).toBeUndefined();
    expect(walkDimensions(input({ rideS: 59 })).ride).toBe('no');
    expect(walkDimensions(input({ rideS: 60 })).ride).toBe('yes');
    expect(walkDimensions(input({ rideS: 600, hasTrack: false })).ride).toBeUndefined();
  });
});

describe('walkOutcomes', () => {
  const o = (extra: Partial<Parameters<typeof walkOutcomes>[0]> = {}) =>
    walkOutcomes({ events: 0, hard: 0, success: 0, reactions: [], summaryDone: false, ...extra });

  it('a walk with nothing recorded says nothing about its outcomes', () => {
    expect(o()).toEqual({ hard_moment: undefined, success: undefined, strong_reaction: undefined });
  });

  it('events make "no hard moment" a fact; so does a finished summary', () => {
    expect(o({ events: 3, hard: 0 }).hard_moment).toBe(false);
    expect(o({ events: 3, hard: 1 }).hard_moment).toBe(true);
    expect(o({ summaryDone: true }).hard_moment).toBe(false);
    expect(o({ summaryDone: true, success: 2 }).success).toBe(true);
  });

  it('a strong reaction needs recorded reactions: 3 and up counts', () => {
    expect(o({ events: 2, reactions: [] }).strong_reaction).toBeUndefined();
    expect(o({ events: 2, reactions: [1, 2] }).strong_reaction).toBe(false);
    expect(o({ events: 2, reactions: [2, 3] }).strong_reaction).toBe(true);
  });
});

describe('the catalog', () => {
  it('names the dimensions and outcomes once each, with an integer version', () => {
    expect(new Set(WALK_DIMENSION_KEYS).size).toBe(WALK_DIMENSION_KEYS.length);
    expect(new Set(WALK_OUTCOME_KEYS).size).toBe(WALK_OUTCOME_KEYS.length);
    expect(Number.isInteger(WALK_DIMENSIONS_VERSION)).toBe(true);
  });

  it('every dimension a walk gives is in the catalog', () => {
    for (const key of Object.keys(walkDimensions(input()))) {
      expect(WALK_DIMENSION_KEYS).toContain(key);
    }
  });
});
