import { describe, expect, it } from 'vitest';

import {
  ENOUGH_PASSES,
  routeStats,
  suggestedRouteName,
  versusUsual,
  type PassLike,
} from './routesModel';

const pass = (minutes: number, extra: Partial<PassLike> = {}): PassLike => ({
  direction: 'forward',
  walkingS: minutes * 60,
  stops: 0,
  ...extra,
});

describe('routeStats', () => {
  it('counts passes, directions and stops, and gives the usual time with its spread', () => {
    const stats = routeStats([
      pass(10),
      pass(12),
      pass(14, { direction: 'backward' }),
      pass(20, { stops: 1 }),
    ]);
    expect(stats).toMatchObject({
      count: 4,
      medianS: 13 * 60,
      minS: 600,
      maxS: 1200,
      forward: 3,
      backward: 1,
      withStops: 1,
      fewData: true,
    });
  });

  it('is enough from five passes', () => {
    expect(routeStats(Array.from({ length: ENOUGH_PASSES }, () => pass(10))).fewData).toBe(false);
    expect(routeStats(Array.from({ length: ENOUGH_PASSES - 1 }, () => pass(10))).fewData).toBe(
      true,
    );
  });

  it('a route without passes has no times', () => {
    expect(routeStats([])).toMatchObject({
      count: 0,
      medianS: null,
      minS: null,
      maxS: null,
      fewData: true,
    });
  });
});

describe('versusUsual', () => {
  const others = [pass(10), pass(11), pass(10), pass(12)];

  it('longer and shorter with the difference in minutes', () => {
    expect(versusUsual(pass(15), others)).toEqual({ kind: 'longer', minutes: 5 });
    expect(versusUsual(pass(5), others)).toEqual({ kind: 'shorter', minutes: 6 });
  });

  it('within two minutes (or a tenth) it is the usual time', () => {
    expect(versusUsual(pass(12.5), others)).toEqual({ kind: 'usual', minutes: 0 });
    expect(versusUsual(pass(9), others)).toEqual({ kind: 'usual', minutes: 0 });
    const long = [pass(60), pass(62), pass(58), pass(60)];
    expect(versusUsual(pass(65), long)?.kind).toBe('usual'); // a tenth of 60 min is 6 min
    expect(versusUsual(pass(67), long)?.kind).toBe('longer');
  });

  it('says nothing from fewer than three other passes', () => {
    expect(versusUsual(pass(15), [pass(10), pass(11)])).toBeNull();
    expect(versusUsual(pass(15), [])).toBeNull();
  });

  it('a pass with a stop is told from passes with a stop', () => {
    const mixed = [
      pass(10),
      pass(10),
      pass(10),
      pass(20, { stops: 1 }),
      pass(21, { stops: 1 }),
      pass(19, { stops: 1 }),
    ];
    expect(versusUsual(pass(20, { stops: 1 }), mixed)?.kind).toBe('usual');
    expect(versusUsual(pass(20), mixed)?.kind).toBe('longer');
  });
});

describe('suggestedRouteName', () => {
  it('names a way by its ends and a loop by its start', () => {
    expect(suggestedRouteName(false, 'Дом', 'Магазин', 'Круг от')).toBe('Дом → Магазин');
    expect(suggestedRouteName(true, 'Дом', 'Дом', 'Круг от')).toBe('Круг от Дом');
  });

  it('nothing when an end has no name', () => {
    expect(suggestedRouteName(false, 'Дом', null, 'Круг от')).toBeNull();
    expect(suggestedRouteName(false, null, null, 'Круг от')).toBeNull();
    expect(suggestedRouteName(true, null, null, 'Круг от')).toBeNull();
  });
});
