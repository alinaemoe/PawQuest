import { describe, expect, it } from 'vitest';

import {
  busyDays,
  persistentChange,
  unusualWalks,
  weightChange,
  type MeasuredWalk,
  type UnusualWalk,
} from './health';
import type { LoadEvent } from './load';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

describe('weightChange', () => {
  it('the latest weight and the change against about a month and three months before', () => {
    const change = weightChange([
      { at: T0, grams: 6000 },
      { at: T0 + 60 * DAY, grams: 6100 },
      { at: T0 + 90 * DAY, grams: 6200 },
    ]);
    expect(change?.latest.grams).toBe(6200);
    expect(change?.change30).toBe(100);
    expect(change?.change90).toBe(200);
  });

  it('an entry from last week is not "a month ago"; one entry or none: no change', () => {
    const near = weightChange([
      { at: T0, grams: 6000 },
      { at: T0 + 7 * DAY, grams: 6100 },
    ]);
    expect(near).toMatchObject({ change30: null, change90: null });
    expect(weightChange([{ at: T0, grams: 6000 }])).toMatchObject({ change30: null });
    expect(weightChange([])).toBeNull();
  });
});

const walk = (i: number, minutes: number): MeasuredWalk => ({
  id: `w${String(i)}`,
  startedAt: T0 + i * DAY,
  durationS: minutes * 60,
});
const usual = [30, 32, 28, 35, 31, 29, 33, 30, 34, 31, 30, 32];

describe('unusualWalks', () => {
  it('a much shorter and a much longer walk stand out from the usual of the same dog', () => {
    const walks = [...usual.map((m, i) => walk(i, m)), walk(12, 4), walk(13, 140)];
    const found = unusualWalks(walks);
    expect(found.map((w) => [w.id, w.kind])).toEqual([
      ['w12', 'short'],
      ['w13', 'long'],
    ]);
    expect(found[0]?.usualS).toBeGreaterThan(1500);
  });

  it('walks like the others, too few walks, or identical walks: nothing is unusual', () => {
    expect(unusualWalks(usual.map((m, i) => walk(i, m)))).toEqual([]);
    expect(unusualWalks([walk(0, 30), walk(1, 4)])).toEqual([]);
    expect(unusualWalks(Array.from({ length: 12 }, (_, i) => walk(i, 30)))).toEqual([]);
  });
});

describe('persistentChange', () => {
  const unusualWalk = (day: number, kind: UnusualWalk['kind']): UnusualWalk => ({
    id: `u${String(day)}`,
    startedAt: T0 + day * DAY,
    durationS: 600,
    kind,
    usualS: 1800,
  });

  it('the same direction on three walks over two weeks is a change that stays', () => {
    const short = [unusualWalk(0, 'short'), unusualWalk(7, 'short'), unusualWalk(15, 'short')];
    expect(persistentChange(short)).toBe('short');
    const long = [unusualWalk(0, 'long'), unusualWalk(8, 'long'), unusualWalk(16, 'long')];
    expect(persistentChange(long)).toBe('long');
  });

  it('too close together, too few, or going both ways: nothing is said', () => {
    const close = [unusualWalk(0, 'short'), unusualWalk(3, 'short'), unusualWalk(6, 'short')];
    expect(persistentChange(close)).toBeNull();
    expect(persistentChange([unusualWalk(0, 'short'), unusualWalk(20, 'short')])).toBeNull();
    const mixed = [unusualWalk(0, 'short'), unusualWalk(10, 'long'), unusualWalk(20, 'short')];
    expect(persistentChange(mixed)).toBeNull();
    expect(persistentChange([])).toBeNull();
  });
});

describe('busyDays', () => {
  const today = Math.floor((T0 + 40 * DAY) / DAY);
  const event = (day: number, reaction?: number): LoadEvent => ({
    ts: day * DAY + 9 * 3_600_000,
    tzOffsetMin: 0,
    kind: 'trigger',
    typeId: 'dog',
    reaction,
  });

  it('the days with the most triggers above the 85th percentile of the days tracked', () => {
    const tracked = Array.from({ length: 30 }, (_, i) => today - 35 + i);
    const events = [
      ...tracked.map((d) => event(d)),
      ...[1, 2, 3, 4, 5].map(() => event(today - 10, 5)),
      ...[1, 2, 3].map(() => event(today - 20, 4)),
    ];
    const busy = busyDays(events, tracked, today);
    expect(busy.map((b) => b.day)).toEqual([today - 10, today - 20]);
    expect(busy[0]?.percentile).toBeGreaterThan(85);
  });

  it('fewer than two weeks tracked, or all days alike: none', () => {
    const few = Array.from({ length: 5 }, (_, i) => today - i);
    expect(
      busyDays(
        few.map((d) => event(d, 5)),
        few,
        today,
      ),
    ).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => today - i);
    expect(
      busyDays(
        many.map((d) => event(d)),
        many,
        today,
      ),
    ).toEqual([]);
  });
});
