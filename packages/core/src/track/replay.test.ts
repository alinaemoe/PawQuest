import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TimeRange } from './motion';
import { gapRanges, movingTimeAxis, positionAt, type ReplayPoint } from './replay';

function pt(tSec: number, lat: number, lon: number): ReplayPoint {
  return { ts: tSec * 1000, lat, lon };
}

const LINE: ReplayPoint[] = [pt(0, 10, 20), pt(10, 11, 22), pt(20, 13, 26)];

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${String(index)}`);
  }
  return item;
}

describe('positionAt', () => {
  it('returns null for an empty track and the only point for a single point', () => {
    expect(positionAt([], 5000)).toBeNull();
    expect(positionAt([pt(5, 1, 2)], 0)).toEqual({ lat: 1, lon: 2 });
    expect(positionAt([pt(5, 1, 2)], 99_000)).toEqual({ lat: 1, lon: 2 });
  });

  it('returns the exact point at its own timestamp', () => {
    expect(positionAt(LINE, 0)).toEqual({ lat: 10, lon: 20 });
    expect(positionAt(LINE, 10_000)).toEqual({ lat: 11, lon: 22 });
    expect(positionAt(LINE, 20_000)).toEqual({ lat: 13, lon: 26 });
  });

  it('interpolates linearly between neighbouring points', () => {
    expect(positionAt(LINE, 5000)).toEqual({ lat: 10.5, lon: 21 });
    const quarter = positionAt(LINE, 12_500);
    expect(quarter?.lat).toBeCloseTo(11.5, 12);
    expect(quarter?.lon).toBeCloseTo(23, 12);
  });

  it('clamps to the first and last point outside the track', () => {
    expect(positionAt(LINE, -1000)).toEqual({ lat: 10, lon: 20 });
    expect(positionAt(LINE, 999_000)).toEqual({ lat: 13, lon: 26 });
  });

  it('freezes at the earlier point across an interval longer than 30 s (gap)', () => {
    const track = [pt(0, 0, 0), pt(10, 1, 1), pt(100, 9, 9)];
    expect(positionAt(track, 50_000)).toEqual({ lat: 1, lon: 1 });
    expect(positionAt(track, 99_999)).toEqual({ lat: 1, lon: 1 });
    expect(positionAt(track, 100_000)).toEqual({ lat: 9, lon: 9 });
  });

  it('does not treat exactly 30 s as a gap', () => {
    const track = [pt(0, 0, 0), pt(30, 3, 3)];
    expect(positionAt(track, 15_000)).toEqual({ lat: 1.5, lon: 1.5 });
  });

  it('freezes inside a manual pause and moves again right after it', () => {
    const pause: TimeRange = { fromTs: 12_000, toTs: 16_000 };
    const track = [pt(0, 0, 0), pt(10, 10, 10), pt(20, 20, 20)];
    expect(positionAt(track, 14_000, { pausedRanges: [pause] })).toEqual({ lat: 10, lon: 10 });
    const after = positionAt(track, 16_000, { pausedRanges: [pause] });
    expect(after?.lat).toBeCloseTo(16, 9);
  });

  it('honours a custom gap length', () => {
    const track = [pt(0, 0, 0), pt(10, 10, 10)];
    expect(positionAt(track, 5000, { gapAfterS: 5 })).toEqual({ lat: 0, lon: 0 });
  });

  it('property: agrees with a linear-scan reference for random times', () => {
    const trackArb = fc
      .array(fc.double({ min: 0.5, max: 25, noNaN: true }), { minLength: 2, maxLength: 40 })
      .map((steps) => {
        let t = 0;
        return steps.map((dt, i) => {
          t += dt;
          return pt(t, i, i * 2);
        });
      });
    fc.assert(
      fc.property(trackArb, fc.double({ min: -5, max: 700, noNaN: true }), (track, tSec) => {
        const ts = tSec * 1000;
        let i = 0;
        while (i + 1 < track.length && at(track, i + 1).ts <= ts) {
          i += 1;
        }
        const a = at(track, i);
        const b = track[i + 1];
        let expected: { lat: number; lon: number };
        if (ts <= at(track, 0).ts) {
          expected = { lat: at(track, 0).lat, lon: at(track, 0).lon };
        } else if (b === undefined) {
          expected = { lat: a.lat, lon: a.lon };
        } else if ((b.ts - a.ts) / 1000 > 30) {
          expected = { lat: a.lat, lon: a.lon };
        } else {
          const f = (ts - a.ts) / (b.ts - a.ts);
          expected = { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon) };
        }
        const actual = positionAt(track, ts);
        expect(actual?.lat).toBeCloseTo(expected.lat, 9);
        expect(actual?.lon).toBeCloseTo(expected.lon, 9);
      }),
    );
  });
});

describe('gapRanges', () => {
  it('lists the intervals between points that are longer than the gap limit', () => {
    const track = [pt(0, 0, 0), pt(10, 0, 0), pt(100, 0, 0), pt(110, 0, 0), pt(140, 0, 0)];
    expect(gapRanges(track)).toEqual([{ fromTs: 10_000, toTs: 100_000 }]);
    expect(gapRanges(track, 20)).toEqual([
      { fromTs: 10_000, toTs: 100_000 },
      { fromTs: 110_000, toTs: 140_000 },
    ]);
  });

  it('returns nothing for fewer than two points', () => {
    expect(gapRanges([])).toEqual([]);
    expect(gapRanges([pt(0, 0, 0)])).toEqual([]);
  });
});

describe('movingTimeAxis', () => {
  it('is the identity when nothing is excluded', () => {
    const axis = movingTimeAxis(1000, 61_000, []);
    expect(axis.lengthMs).toBe(60_000);
    expect(axis.toAxis(31_000)).toBe(30_000);
    expect(axis.toWall(30_000)).toBe(31_000);
  });

  it('removes excluded ranges from the axis length', () => {
    const axis = movingTimeAxis(0, 100_000, [
      { fromTs: 20_000, toTs: 30_000 },
      { fromTs: 60_000, toTs: 80_000 },
    ]);
    expect(axis.lengthMs).toBe(70_000);
  });

  it('maps wall time to axis time, collapsing time inside an excluded range', () => {
    const axis = movingTimeAxis(0, 100_000, [{ fromTs: 20_000, toTs: 30_000 }]);
    expect(axis.toAxis(10_000)).toBe(10_000);
    expect(axis.toAxis(25_000)).toBe(20_000); // inside: stuck at the range start
    expect(axis.toAxis(30_000)).toBe(20_000);
    expect(axis.toAxis(50_000)).toBe(40_000);
  });

  it('maps axis time back to wall time, left-continuous at the edge of an exclusion', () => {
    const axis = movingTimeAxis(0, 100_000, [{ fromTs: 20_000, toTs: 30_000 }]);
    expect(axis.toWall(10_000)).toBe(10_000);
    expect(axis.toWall(20_000)).toBe(20_000); // on the boundary: the start of the excluded range
    expect(axis.toWall(20_001)).toBe(30_001);
    expect(axis.toWall(40_000)).toBe(50_000);
  });

  it('clamps arguments outside the track', () => {
    const axis = movingTimeAxis(1000, 11_000, [{ fromTs: 4000, toTs: 6000 }]);
    expect(axis.toAxis(-5000)).toBe(0);
    expect(axis.toAxis(99_000)).toBe(axis.lengthMs);
    expect(axis.toWall(-1)).toBe(1000);
    expect(axis.toWall(999_000)).toBe(11_000);
  });

  it('merges overlapping ranges, clips them to the track and ignores invalid ones', () => {
    const axis = movingTimeAxis(0, 100_000, [
      { fromTs: -10_000, toTs: 5_000 },
      { fromTs: 4_000, toTs: 8_000 },
      { fromTs: 50_000, toTs: 50_000 },
      { fromTs: Number.NaN, toTs: 70_000 },
      { fromTs: 90_000, toTs: 150_000 },
    ]);
    expect(axis.lengthMs).toBe(100_000 - 8_000 - 10_000);
  });

  it('rejects an end before the start', () => {
    expect(() => movingTimeAxis(10, 5, [])).toThrow(RangeError);
    expect(() => movingTimeAxis(Number.NaN, 5, [])).toThrow(RangeError);
  });

  it('property: toWall(toAxis(t)) returns t for every time outside the excluded ranges', () => {
    const rangesArb = fc.array(
      fc.tuple(fc.integer({ min: 0, max: 90_000 }), fc.integer({ min: 1, max: 20_000 })),
      { maxLength: 6 },
    );
    fc.assert(
      fc.property(rangesArb, fc.integer({ min: 0, max: 100_000 }), (raw, t) => {
        const ranges = raw.map(([from, len]) => ({ fromTs: from, toTs: from + len }));
        const axis = movingTimeAxis(0, 100_000, ranges);
        // Both edges of an excluded range share one axis position, so the inverse (left-continuous)
        // returns the range start: the round trip is only exact strictly outside [from, to].
        const inside = ranges.some((r) => t >= r.fromTs && t <= r.toTs);
        if (!inside) {
          expect(axis.toWall(axis.toAxis(t))).toBe(t);
        }
        expect(axis.toAxis(t)).toBeGreaterThanOrEqual(0);
        expect(axis.toAxis(t)).toBeLessThanOrEqual(axis.lengthMs);
      }),
    );
  });
});
