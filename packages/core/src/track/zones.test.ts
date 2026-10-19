import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M } from '../geo/haversine';

import type { ChronoPlace } from './chronology';
import { mainPlace, zoneVisits, zonesAt, type ZoneFix } from './zones';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const T0 = Date.UTC(2026, 9, 19, 10, 0, 0);
const at = (x: number, y = 0): { lat: number; lon: number } => ({
  lat: 55 + y / M_PER_DEG,
  lon: 37 + x / (M_PER_DEG * Math.cos((55 * Math.PI) / 180)),
});
const place = (id: string, x: number, radiusM: number): ChronoPlace => ({
  id,
  name: id,
  ...at(x),
  radiusM,
});

/** A track along the x axis: (second, x) pairs, a fix at each listed second. */
const track = (pairs: readonly (readonly [number, number])[], accuracyM = 5): ZoneFix[] =>
  pairs.map(([s, x]) => ({ ts: T0 + s * 1000, ...at(x), accuracyM }));

/** One fix a second, moving at `speed` m/s from `fromX` to `toX`, starting at second `s0`. */
const walk = (s0: number, fromX: number, toX: number, speed = 1.4): [number, number][] => {
  const steps = Math.max(1, Math.round(Math.abs(toX - fromX) / speed));
  return Array.from({ length: steps + 1 }, (_, i) => [s0 + i, fromX + ((toX - fromX) * i) / steps]);
};

const PARK = place('park', 500, 150); // from x = 350 to 650

describe('zoneVisits', () => {
  it('a walk through a place is one visit: from the first fix inside to the last, moving or not', () => {
    const fixes = track(walk(0, 0, 1000));
    const [visit, ...rest] = zoneVisits(fixes, [PARK]);
    expect(rest).toEqual([]);
    expect(visit?.placeId).toBe('park');
    expect(visit?.dwellS).toBeGreaterThan(200);
    expect(visit?.dwellS).toBeLessThan(230);
    expect(visit?.open).toBe(false);
    expect(visit?.fromTs).toBeGreaterThanOrEqual(T0 + 190_000);
  });

  it('the wobble at the fence is one visit, not ten', () => {
    const wobble: [number, number][] = [];
    for (let s = 0; s < 60; s += 1) {
      wobble.push([s, s % 2 === 0 ? 351 : 330]); // in, out, in, out
    }
    const inside = walk(60, 360, 600);
    const visits = zoneVisits(track([...wobble, ...inside]), [PARK]);
    expect(visits).toHaveLength(1);
  });

  it('grazing the corner for a few seconds is no visit', () => {
    const fixes = track([...walk(0, 300, 352, 3), ...walk(20, 352, 300, 3)]);
    expect(zoneVisits(fixes, [PARK])).toEqual([]);
  });

  it('a gap with the same place on both sides is time inside, and is told', () => {
    const fixes = track([...walk(0, 400, 600), [300, 600], [301, 601], [302, 602]]);
    const visits = zoneVisits(fixes, [PARK]);
    expect(visits).toHaveLength(1);
    expect(visits[0]?.gapS).toBeGreaterThan(100);
  });

  it('a gap longer than five minutes breaks the visit in two', () => {
    const fixes = track([...walk(0, 400, 600), [1000, 600], [1001, 601], [1002, 602], [1003, 603]]);
    expect(zoneVisits(fixes, [PARK])).toHaveLength(2);
  });

  it('out for a while and back is two visits; out for a few seconds is still one', () => {
    const out = track([...walk(0, 400, 640), ...walk(200, 640, 800), ...walk(400, 800, 500)]);
    expect(zoneVisits(out, [PARK])).toHaveLength(2);
    const brief = track([...walk(0, 400, 640), [200, 700], [201, 640], ...walk(210, 640, 500)]);
    expect(zoneVisits(brief, [PARK])).toHaveLength(1);
  });

  it('places inside each other are both visited; the time in the glade is time in the park', () => {
    const glade = place('glade', 500, 20);
    const visits = zoneVisits(track(walk(0, 300, 700, 2)), [PARK, glade]);
    expect(visits.map((v) => v.placeId).sort()).toEqual(['glade', 'park']);
    const park = visits.find((v) => v.placeId === 'park');
    const inner = visits.find((v) => v.placeId === 'glade');
    expect(park?.dwellS ?? 0).toBeGreaterThan(inner?.dwellS ?? 0);
    expect(inner?.fromTs ?? 0).toBeGreaterThanOrEqual(park?.fromTs ?? 0);
  });

  it('a poor fix does not enter a place; a walk that ends inside is an open visit', () => {
    const poor = track(walk(0, 400, 600), 80);
    expect(zoneVisits(poor, [PARK])).toEqual([]);
    const ends = zoneVisits(track(walk(0, 400, 550)), [PARK]);
    expect(ends).toHaveLength(1);
    expect(ends[0]?.open).toBe(true);
  });

  it('a contour is used when the place has one', () => {
    const square: ChronoPlace = {
      ...place('square', 500, 10),
      boundary: [at(450, -50), at(550, -50), at(550, 50), at(450, 50)],
    };
    const visits = zoneVisits(track(walk(0, 300, 700)), [square]);
    expect(visits).toHaveLength(1);
    expect(visits[0]?.dwellS).toBeGreaterThan(60);
    expect(visits[0]?.dwellS).toBeLessThan(110);
  });

  it('no track, no places, one fix: nothing', () => {
    expect(zoneVisits([], [PARK])).toEqual([]);
    expect(zoneVisits(track(walk(0, 400, 600)), [])).toEqual([]);
    expect(zoneVisits(track([[0, 500]]), [PARK])).toEqual([]);
  });

  it('visits of one place never overlap and stay inside the track, whatever the wandering', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const points: [number, number][] = [];
      let x = 300;
      for (let s = 0; s < 900; s += 1) {
        x += Math.sin(s / (7 + seed)) * 3 + Math.cos(s * seed) * 1.5;
        points.push([s, x]);
      }
      const visits = zoneVisits(track(points), [PARK, place('b', 380, 30)]);
      for (const id of ['park', 'b']) {
        const own = visits.filter((v) => v.placeId === id);
        own.forEach((v, i) => {
          expect(v.toTs).toBeGreaterThanOrEqual(v.fromTs);
          expect(v.fromTs).toBeGreaterThanOrEqual(T0);
          expect(v.toTs).toBeLessThanOrEqual(T0 + 899_000);
          if (i > 0) {
            expect(v.fromTs).toBeGreaterThan(own[i - 1]?.toTs ?? 0);
          }
        });
      }
    }
  });
});

describe('zonesAt and mainPlace', () => {
  const visits = zoneVisits(track(walk(0, 300, 700, 2)), [PARK, place('glade', 500, 20)]);

  it('the places at a moment, the ends included', () => {
    const park = visits.find((v) => v.placeId === 'park');
    expect(zonesAt(visits, (park?.fromTs ?? 0) + 1000)).toEqual(['park']);
    expect(zonesAt(visits, T0 + 100_000).sort()).toEqual(['glade', 'park']);
    expect(zonesAt(visits, T0 + 5_000_000)).toEqual([]);
  });

  it('the main place has the most time; a base only when nothing else held the minimum', () => {
    expect(mainPlace(visits)).toBe('park');
    const home = zoneVisits(track(walk(0, 0, 40, 0.1)), [place('home', 20, 60), PARK]);
    expect(mainPlace(home, { baseIds: new Set(['home']) })).toBe('home');
    const both = [
      ...zoneVisits(track(walk(0, 0, 200, 0.5)), [place('home', 100, 120)]),
      ...zoneVisits(track(walk(0, 500, 600, 0.5)), [PARK]),
    ];
    expect(mainPlace(both, { baseIds: new Set(['home']) })).toBe('park');
    expect(mainPlace(both)).toBe('home');
    expect(mainPlace([])).toBeNull();
    expect(mainPlace(visits, { minDwellS: 10_000 })).toBeNull();
  });
});
