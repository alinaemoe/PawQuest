import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM, type LatLon } from '../geo/haversine';

import { suggestPlaces, type StopInput } from './suggest';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);

function at(n: number, e: number): LatLon {
  return { lat: 55 + n / M_PER_DEG, lon: 37 + e / (M_PER_DEG * COS) };
}

function stop(walkId: string, n: number, e: number, durationS = 300): StopInput {
  return { ...at(n, e), walkId, durationS };
}

describe('suggestPlaces (A-12)', () => {
  const park = [stop('w1', 0, 0), stop('w2', 5, 5), stop('w3', -4, 3)];

  it('suggests a place from long stops repeated over several walks', () => {
    const [s] = suggestPlaces(park, []);
    expect(s?.stopCount).toBe(3);
    expect(s?.walkCount).toBe(3);
    expect(s?.totalDurationS).toBe(900);
    expect(s?.stopIndices).toEqual([0, 1, 2]);
    expect(haversineDistanceM(s ?? at(0, 0), at(0, 3))).toBeLessThan(6);
  });

  it('centres the suggestion on the median position', () => {
    const [s] = suggestPlaces([stop('w1', 0, 0), stop('w2', 6, 0), stop('w3', 100000, 0)], [], {
      epsM: 200000,
    });
    // median of 0 m, 6 m, 100 km north is the 6 m stop
    expect(s?.lat).toBeCloseTo(at(6, 0).lat, 12);
  });

  it('ignores stops shorter than 3 minutes (inclusive limit)', () => {
    const short = park.map((p) => ({ ...p, durationS: 179 }));
    expect(suggestPlaces(short, [])).toEqual([]);
    const exact = park.map((p) => ({ ...p, durationS: 180 }));
    expect(suggestPlaces(exact, [])).toHaveLength(1);
  });

  it('needs at least minPts stops', () => {
    expect(suggestPlaces(park.slice(0, 2), [])).toEqual([]);
  });

  it('rejects a cluster whose stops all come from a single walk', () => {
    const oneWalk = [stop('w1', 0, 0), stop('w1', 5, 5), stop('w1', -4, 3)];
    expect(suggestPlaces(oneWalk, [])).toEqual([]);
    expect(suggestPlaces(oneWalk, [], { minWalks: 1 })).toHaveLength(1);
  });

  it('skips clusters that already have a saved place within 60 m (inclusive)', () => {
    const centre = suggestPlaces(park, [])[0] as LatLon;
    const justInside = { lat: centre.lat + 60 / M_PER_DEG, lon: centre.lon };
    const justOutside = { lat: centre.lat + 61 / M_PER_DEG, lon: centre.lon };
    expect(suggestPlaces(park, [justInside])).toEqual([]);
    expect(suggestPlaces(park, [justOutside])).toHaveLength(1);
  });

  it('returns several suggestions, longest total stop time first', () => {
    const far = (w: string, n: number, e: number, d: number) => stop(w, 2000 + n, 2000 + e, d);
    const stops = [
      ...park, // 900 s
      far('w1', 0, 0, 1000),
      far('w2', 3, 3, 1000),
      far('w3', -3, 2, 1000), // 3000 s
    ];
    const result = suggestPlaces(stops, []);
    expect(result.map((s) => s.totalDurationS)).toEqual([3000, 900]);
    expect(result[0]?.stopIndices).toEqual([3, 4, 5]);
  });

  it('keeps original indices when short stops are filtered out', () => {
    const stops = [stop('w0', 900, 900, 10), ...park];
    expect(suggestPlaces(stops, [])[0]?.stopIndices).toEqual([1, 2, 3]);
  });

  it('honours custom options', () => {
    const wide = [stop('w1', 0, 0), stop('w2', 70, 0), stop('w3', 0, 70)];
    expect(suggestPlaces(wide, [])).toEqual([]);
    expect(suggestPlaces(wide, [], { epsM: 100 })).toHaveLength(1);
  });

  it('returns nothing for no stops and rejects invalid durations', () => {
    expect(suggestPlaces([], [])).toEqual([]);
    expect(() => suggestPlaces([{ ...stop('w', 0, 0), durationS: Number.NaN }], [])).toThrow(
      RangeError,
    );
  });
});
