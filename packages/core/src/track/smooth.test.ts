import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { smoothMedian } from './smooth';

interface Pt {
  readonly lat: number;
  readonly lon: number;
  readonly ts: number;
}

function pts(coords: readonly (readonly [number, number])[]): Pt[] {
  return coords.map(([lat, lon], i) => ({ lat, lon, ts: i * 1000 }));
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${String(index)}`);
  }
  return item;
}

describe('smoothMedian', () => {
  it('returns an empty array for no points and a copy for one or two points', () => {
    expect(smoothMedian([])).toEqual([]);
    const one = pts([[10, 20]]);
    expect(smoothMedian(one)).toEqual(one);
    const two = pts([
      [10, 20],
      [11, 21],
    ]);
    expect(smoothMedian(two)).toEqual(two);
  });

  it('leaves a constant track unchanged', () => {
    const track = pts(Array.from({ length: 9 }, () => [10, 20] as const));
    expect(smoothMedian(track)).toEqual(track);
  });

  it('removes a single GPS spike in the interior', () => {
    const track = pts([
      [0, 0],
      [0.1, 0],
      [0.2, 0],
      [5, 0], // spike
      [0.4, 0],
      [0.5, 0],
      [0.6, 0],
    ]);
    const out = smoothMedian(track);
    expect(at(out, 3).lat).toBeCloseTo(0.4, 12);
  });

  it('keeps the first and last points exactly', () => {
    const track = pts([
      [1, 1],
      [9, 9],
      [2, 2],
      [8, 8],
      [3, 3],
    ]);
    const out = smoothMedian(track);
    expect(at(out, 0)).toEqual(at(track, 0));
    expect(at(out, 4)).toEqual(at(track, 4));
  });

  it('narrows the window symmetrically near the ends (second point uses 3 values)', () => {
    const track = pts([
      [0, 0],
      [10, 10],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    const out = smoothMedian(track);
    // window for index 1 is indices 0..2 -> median of [0, 10, 2] = 2
    expect(at(out, 1).lat).toBe(2);
    expect(at(out, 1).lon).toBe(2);
  });

  it('smooths latitude and longitude independently and keeps other fields', () => {
    const track = pts([
      [0, 5],
      [1, 0],
      [2, 9],
      [3, 1],
      [4, 8],
    ]);
    const out = smoothMedian(track);
    expect(at(out, 2).lat).toBe(2); // median of [0,1,2,3,4]
    expect(at(out, 2).lon).toBe(5); // median of [5,0,9,1,8]
    expect(at(out, 2).ts).toBe(2000);
  });

  it('does not mutate its input', () => {
    const track = pts([
      [0, 0],
      [9, 9],
      [1, 1],
      [8, 8],
      [2, 2],
    ]);
    const copy = structuredClone(track);
    smoothMedian(track);
    expect(track).toEqual(copy);
  });

  it('supports a window of 1 (identity) and a custom odd window', () => {
    const track = pts([
      [0, 0],
      [9, 9],
      [1, 1],
      [8, 8],
      [2, 2],
    ]);
    expect(smoothMedian(track, 1)).toEqual(track);
    expect(smoothMedian(track, 3)).toHaveLength(5);
  });

  it.each([0, 2, 4, -1, 1.5, Number.NaN])('rejects the invalid window %s', (w) => {
    expect(() => smoothMedian([], w)).toThrow(RangeError);
  });

  it('property: keeps length, endpoints, and stays inside the bounding box of the input', () => {
    const trackArb = fc.array(
      fc.record({
        lat: fc.double({ min: -80, max: 80, noNaN: true }),
        lon: fc.double({ min: -170, max: 170, noNaN: true }),
        ts: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(trackArb, (track) => {
        const out = smoothMedian(track);
        expect(out).toHaveLength(track.length);
        if (track.length > 0) {
          expect(at(out, 0)).toEqual(at(track, 0));
          expect(at(out, out.length - 1)).toEqual(at(track, track.length - 1));
        }
        const lats = track.map((p) => p.lat);
        const lons = track.map((p) => p.lon);
        for (const p of out) {
          expect(p.lat).toBeGreaterThanOrEqual(Math.min(...lats));
          expect(p.lat).toBeLessThanOrEqual(Math.max(...lats));
          expect(p.lon).toBeGreaterThanOrEqual(Math.min(...lons));
          expect(p.lon).toBeLessThanOrEqual(Math.max(...lons));
        }
      }),
    );
  });
});
