import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, type LatLon } from './haversine';
import { areaCentre, overpassQuery, parseOverpassAreas } from './osmAreas';
import { pointInRing } from './polygon';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);
const at = (x: number, y: number): LatLon => ({
  lat: 55 + y / M_PER_DEG,
  lon: 37 + x / (M_PER_DEG * COS),
});
const geo = (...points: LatLon[]) => points.map((p) => ({ lat: p.lat, lon: p.lon }));
const closedSquare = (size: number, x = 0, y = 0) => {
  const a = at(x, y);
  return geo(a, at(x + size, y), at(x + size, y + size), at(x, y + size), a);
};

describe('parseOverpassAreas', () => {
  it('takes a closed way with its name and kind', () => {
    const areas = parseOverpassAreas(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { leisure: 'park', name: 'Парк' },
            geometry: closedSquare(200),
          },
        ],
      },
      at(100, 100),
    );
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ source: 'way/1', name: 'Парк', kind: 'park' });
    expect(areas[0]?.areaM2).toBeGreaterThan(39_000);
    expect(areas[0]?.ring).toHaveLength(4);
  });

  it('joins the pieces of a big park, some of them reversed', () => {
    const a = at(0, 0);
    const b = at(400, 0);
    const c = at(400, 400);
    const d = at(0, 400);
    const areas = parseOverpassAreas(
      {
        elements: [
          {
            type: 'relation',
            id: 7,
            tags: { leisure: 'park', name: 'Парк 900-летия' },
            members: [
              { type: 'way', role: 'outer', geometry: geo(a, at(200, 0), b) },
              { type: 'way', role: 'outer', geometry: geo(c, at(400, 200), b) },
              { type: 'way', role: 'outer', geometry: geo(c, at(200, 400), d, at(0, 200), a) },
              { type: 'way', role: 'inner', geometry: closedSquare(50, 100, 100) },
            ],
          },
        ],
      },
      at(200, 200),
    );
    expect(areas).toHaveLength(1);
    expect(areas[0]?.source).toBe('relation/7');
    expect(areas[0]?.areaM2).toBeGreaterThan(155_000);
    expect(pointInRing(at(200, 200), areas[0]?.ring ?? [])).toBe(true);
  });

  it('skips what is not a closed area: an open way, a relation that does not close, no tags', () => {
    const open = geo(at(0, 0), at(100, 0), at(100, 100), at(0, 100));
    const areas = parseOverpassAreas(
      {
        elements: [
          { type: 'way', id: 1, tags: { leisure: 'park' }, geometry: open },
          {
            type: 'relation',
            id: 2,
            tags: { leisure: 'park' },
            members: [{ type: 'way', role: 'outer', geometry: open }],
          },
          { type: 'way', id: 3, tags: { highway: 'path' }, geometry: closedSquare(100) },
          { type: 'node', id: 4, tags: { leisure: 'park' } },
        ],
      },
      at(50, 50),
    );
    expect(areas).toEqual([]);
  });

  it('puts the areas that contain the position first, the smallest of them leading', () => {
    const areas = parseOverpassAreas(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { leisure: 'park', name: 'Большой' },
            geometry: closedSquare(1000, -500, -500),
          },
          {
            type: 'way',
            id: 2,
            tags: { leisure: 'garden', name: 'Рядом' },
            geometry: closedSquare(60, 300, 300),
          },
          {
            type: 'way',
            id: 3,
            tags: { landuse: 'forest', name: 'Малый' },
            geometry: closedSquare(100, -50, -50),
          },
        ],
      },
      at(0, 0),
    );
    expect(areas.map((a) => a.name)).toEqual(['Малый', 'Большой', 'Рядом']);
  });

  it('copes with nonsense', () => {
    expect(parseOverpassAreas(null, at(0, 0))).toEqual([]);
    expect(parseOverpassAreas({}, at(0, 0))).toEqual([]);
    expect(parseOverpassAreas({ elements: 'x' }, at(0, 0))).toEqual([]);
    expect(
      parseOverpassAreas(
        {
          elements: [
            { type: 'way', id: 1, tags: { leisure: 'park' }, geometry: [{ lat: 'a', lon: 1 }] },
          ],
        },
        at(0, 0),
      ),
    ).toEqual([]);
  });

  it('an unnamed area has no name', () => {
    const areas = parseOverpassAreas(
      {
        elements: [{ type: 'way', id: 1, tags: { natural: 'wood' }, geometry: closedSquare(100) }],
      },
      at(50, 50),
    );
    expect(areas[0]?.name).toBeNull();
    expect(areas[0]?.kind).toBe('wood');
    const centre = areaCentre(
      areas[0] ?? { ring: [], source: '', name: null, kind: '', areaM2: 0 },
    );
    expect(Math.abs(centre.lat - at(50, 50).lat)).toBeLessThan(0.0001);
  });
});

describe('overpassQuery', () => {
  it('asks for parks, woods and gardens around the position, with their outline', () => {
    const q = overpassQuery({ lat: 53.9, lon: 27.55 }, 120);
    expect(q).toContain('(around:120,53.90000,27.55000)');
    expect(q).toContain('"leisure"');
    expect(q).toContain('relation(around');
    expect(q.endsWith('out geom;')).toBe(true);
  });
});
