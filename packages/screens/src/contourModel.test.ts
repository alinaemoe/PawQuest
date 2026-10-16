import { EARTH_RADIUS_M, type LatLon, type MapArea } from '@pawquest/core';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import {
  candidateLine,
  formatArea,
  insertVertex,
  moveVertex,
  removeVertex,
  ringState,
} from './contourModel';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);
const at = (x: number, y: number): LatLon => ({
  lat: 55 + y / M_PER_DEG,
  lon: 37 + x / (M_PER_DEG * COS),
});
const square = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });

describe('insertVertex', () => {
  it('the first points just follow one another', () => {
    expect(insertVertex([], at(0, 0))).toEqual([at(0, 0)]);
    expect(insertVertex([at(0, 0), at(10, 0)], at(5, 5))).toHaveLength(3);
  });

  it('a new point goes into the edge nearest to it, so the outline does not tangle', () => {
    const ring = insertVertex(square, at(50, -20));
    expect(ring).toHaveLength(5);
    expect(ring[1]).toEqual(at(50, -20)); // between (0,0) and (100,0)
    expect(ringState(ring).ok).toBe(true);
    const side = insertVertex(square, at(130, 50));
    expect(side[2]).toEqual(at(130, 50)); // between (100,0) and (100,100)
    const closing = insertVertex(square, at(-30, 50));
    expect(closing[4]).toEqual(at(-30, 50)); // between (0,100) and (0,0): at the end
  });

  it('does not change the ring it was given', () => {
    const copy = [...square];
    insertVertex(square, at(50, -20));
    expect(square).toEqual(copy);
  });
});

describe('moveVertex and removeVertex', () => {
  it('moves one vertex', () => {
    const moved = moveVertex(square, 2, at(150, 150));
    expect(moved[2]).toEqual(at(150, 150));
    expect(moved[1]).toEqual(square[1]);
  });

  it('removes a vertex, but never from a triangle', () => {
    expect(removeVertex(square, 1)).toHaveLength(3);
    const triangle = [at(0, 0), at(100, 0), at(50, 100)];
    expect(removeVertex(triangle, 0)).toEqual(triangle);
  });
});

describe('ringState', () => {
  it('says what is wrong', () => {
    expect(ringState([])).toMatchObject({ ok: false, problem: 'few' });
    expect(ringState([at(0, 0), at(10, 0)])).toMatchObject({ ok: false, problem: 'few' });
    expect(ringState([at(0, 0), at(100, 100), at(100, 0), at(0, 100)])).toMatchObject({
      ok: false,
      problem: 'cross',
    });
    expect(ringState([at(0, 0), at(5, 0), at(5, 5), at(0, 5)])).toMatchObject({
      ok: false,
      problem: 'small',
    });
    expect(ringState([...square, { lat: 99, lon: 0 }])).toMatchObject({
      ok: false,
      problem: 'invalid',
    });
  });

  it('a good ring is ok, with its area', () => {
    const state = ringState(square);
    expect(state.ok).toBe(true);
    expect(state.problem).toBeNull();
    expect(state.areaM2).toBeGreaterThan(9990);
  });
});

describe('formatArea and candidateLine', () => {
  it('hectares for a park, square meters for a yard, in both languages', () => {
    expect(formatArea(334_000, ru)).toBe('33 га');
    expect(formatArea(45_000, ru)).toBe('4,5 га');
    expect(formatArea(850, ru)).toBe('850 м²');
    expect(formatArea(334_000, en)).toBe('33 ha');
    expect(formatArea(12_340, en)).toBe('1.2 ha');
  });

  it('names a candidate by its name, else by what the map calls it', () => {
    const base: MapArea = {
      source: 'way/1',
      name: 'Парк 900-летия',
      kind: 'park',
      ring: square,
      areaM2: 334_000,
    };
    expect(candidateLine(base, ru)).toBe('Парк 900-летия · 33 га');
    expect(candidateLine({ ...base, name: null }, ru)).toBe('Парк · 33 га');
    expect(candidateLine({ ...base, name: null, kind: 'wood' }, ru)).toBe('Лес · 33 га');
    expect(candidateLine({ ...base, name: null, kind: 'strange' }, ru)).toBe(
      'Зелёная зона · 33 га',
    );
  });
});
