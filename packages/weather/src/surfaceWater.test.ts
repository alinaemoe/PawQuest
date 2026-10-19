import { describe, expect, it } from 'vitest';

import { DAMP_FROM_MM, WET_FROM_MM, surfaceWaterMm, type HourlyWater } from './surfaceWater';

/** `rainMm` in the first hours, then dry hours with the given evaporation, `total` hours in all. */
function days(rainMm: number, rainHours: number, et0PerDay: number, total: number): HourlyWater[] {
  return Array.from({ length: total }, (_, h) => ({
    rainMm: h < rainHours ? rainMm / rainHours : 0,
    et0Mm: et0PerDay / 24,
  }));
}

const AUTUMN = 0.5; // mm a day, 8 degrees under a grey sky
const SUMMER = 4; // mm a day, a hot sunny day

describe('surfaceWaterMm', () => {
  it('a downpour in autumn: still wet for three days, damp for five, in the end dry', () => {
    expect(surfaceWaterMm(days(10, 6, AUTUMN, 6 + 72))).toBeGreaterThan(WET_FROM_MM);
    expect(surfaceWaterMm(days(10, 6, AUTUMN, 6 + 120))).toBeGreaterThan(DAMP_FROM_MM);
    expect(surfaceWaterMm(days(10, 6, AUTUMN, 6 + 120))).toBeLessThan(WET_FROM_MM);
    expect(surfaceWaterMm(days(10, 6, AUTUMN, 6 + 168))).toBeLessThan(DAMP_FROM_MM);
  });

  it('the same rain in summer is gone within about two days', () => {
    expect(surfaceWaterMm(days(10, 6, SUMMER, 6 + 24))).toBeGreaterThan(WET_FROM_MM);
    expect(surfaceWaterMm(days(10, 6, SUMMER, 6 + 72))).toBeLessThan(DAMP_FROM_MM);
  });

  it('a light rain two days ago in cold weather leaves the ground damp, in summer dry', () => {
    const cold = surfaceWaterMm(days(3, 4, AUTUMN, 4 + 48));
    expect(cold).toBeGreaterThan(DAMP_FROM_MM);
    expect(cold).toBeLessThan(WET_FROM_MM);
    expect(surfaceWaterMm(days(3, 4, SUMMER, 4 + 48))).toBeLessThan(DAMP_FROM_MM);
  });

  it('no rain at all is dry; a missing evaporation is read as a mild day; never negative', () => {
    expect(surfaceWaterMm([])).toBe(0);
    expect(surfaceWaterMm(days(0, 0, SUMMER, 48))).toBe(0);
    const unknown = surfaceWaterMm(
      Array.from({ length: 30 }, (_, h) => ({ rainMm: h === 0 ? 5 : 0, et0Mm: null })),
    );
    expect(unknown).toBeGreaterThan(3);
    expect(surfaceWaterMm([{ rainMm: -1, et0Mm: -1 }])).toBe(0);
  });
});
