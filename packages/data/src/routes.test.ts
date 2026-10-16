import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import {
  createRoute,
  deleteRoute,
  getRoute,
  listRoutes,
  proposeRoutes,
  renameRoute,
  routePasses,
  walkRoutePasses,
} from './routes';
import { START, testEnv, type TestEnv } from './test-utils';

const M_PER_DEG = 111_195;
const LAT0 = 55;
const LON0 = 37;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const DAY = 86_400_000;
const NOW = START + 20 * DAY;

/** A spot `x` meters east and `y` meters north of the origin. */
const spot = (x: number, y: number) => ({
  lat: LAT0 + y / M_PER_DEG,
  lon: LON0 + x / (M_PER_DEG * COS),
});

type Stop = readonly [x: number, y: number, standS: number];

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** A GPS walk that stands at each stop for its time and walks between them at 1.3 m/s. */
function routeWalk(day: number, stops: readonly Stop[]): string {
  const points: TrackPointInput[] = [];
  let t = START + day * DAY;
  let x = stops[0]?.[0] ?? 0;
  let y = stops[0]?.[1] ?? 0;
  const fix = (speed: number, wobble = 0): void => {
    points.push({ ts: t, ...spot(x + wobble, y), accuracyM: 5, speedMps: speed });
  };
  fix(0);
  stops.forEach(([sx, sy, standS], index) => {
    if (index > 0) {
      const distance = Math.hypot(sx - x, sy - y);
      const steps = Math.max(1, Math.round(distance / 6.5));
      const fromX = x;
      const fromY = y;
      for (let i = 1; i <= steps; i += 1) {
        t += 5000;
        x = fromX + ((sx - fromX) * i) / steps;
        y = fromY + ((sy - fromY) * i) / steps;
        fix(1.3);
      }
    }
    for (let s = 5; s <= standS; s += 5) {
      t += 5000;
      fix(0, s % 10 === 0 ? 1.5 : -1.5);
    }
  });
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, t);
  return walk.id;
}

const HOME: Stop = [0, 0, 300];
const SHOP: Stop = [900, 0, 400];
const HOME_BACK: Stop = [0, 0, 300];

function savePlaces(): void {
  createPlace(env.db, env.ctx, { name: 'Дом', category: 'home', label: 'Дом', ...spot(0, 0) });
  createPlace(env.db, env.ctx, {
    name: 'Магазин',
    category: 'shop',
    label: 'Магазин',
    ...spot(900, 0),
  });
}

describe('proposeRoutes (S-16)', () => {
  it('the same way walked three times is proposed, named by the places at its ends', () => {
    savePlaces();
    [0, 1, 2].forEach((d) => routeWalk(d, [HOME, SHOP]));
    const found = proposeRoutes(env.db, NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      legCount: 3,
      walkCount: 3,
      loop: false,
      startName: 'Дом',
      endName: 'Магазин',
    });
    expect(found[0]?.lengthM).toBeGreaterThan(850);
    expect(found[0]?.lengthM).toBeLessThan(950);
  });

  it('two walks are not yet a habit', () => {
    [0, 1].forEach((d) => routeWalk(d, [HOME, SHOP]));
    expect(proposeRoutes(env.db, NOW)).toEqual([]);
  });

  it('the way there and the way back are one route walked in two directions', () => {
    routeWalk(0, [HOME, SHOP]);
    routeWalk(1, [[900, 0, 300], HOME_BACK]);
    routeWalk(2, [HOME, SHOP]);
    const found = proposeRoutes(env.db, NOW);
    expect(found).toHaveLength(1);
    expect(found[0]?.legCount).toBe(3);
    expect(found[0]?.startName).toBeNull();
  });

  it('a way without named ends is still proposed, only without a name', () => {
    [0, 1, 2].forEach((d) => routeWalk(d, [HOME, SHOP]));
    expect(proposeRoutes(env.db, NOW)[0]).toMatchObject({ startName: null, endName: null });
  });

  it('different ways make different proposals; old walks and walks without legs give none', () => {
    [0, 1, 2].forEach((d) => routeWalk(d, [HOME, SHOP]));
    [3, 4, 5].forEach((d) =>
      routeWalk(d, [
        [0, 1500, 300],
        [0, 2400, 300],
      ]),
    );
    expect(proposeRoutes(env.db, NOW)).toHaveLength(2);
    expect(proposeRoutes(env.db, NOW + 400 * DAY)).toEqual([]);
    expect(proposeRoutes(env.db, NOW)).not.toEqual([]);
  });
});

describe('saved routes and their passes', () => {
  function saved() {
    savePlaces();
    [0, 1, 2].forEach((d) => routeWalk(d, [HOME, SHOP]));
    const proposal = proposeRoutes(env.db, NOW)[0];
    if (proposal === undefined) {
      throw new Error('no proposal');
    }
    return createRoute(env.db, env.ctx, {
      name: 'До магазина',
      points: proposal.line,
      startPlaceId: proposal.startPlaceId,
      endPlaceId: proposal.endPlaceId,
    });
  }

  it('a saved route is not proposed again, and has its passes', () => {
    const route = saved();
    expect(proposeRoutes(env.db, NOW)).toEqual([]);
    const passes = routePasses(env.db, route, NOW);
    expect(passes).toHaveLength(3);
    expect(passes.every((p) => p.stops === 0)).toBe(true);
    expect(passes.every((p) => p.lengthM > 850 && p.lengthM < 950)).toBe(true);
    expect(passes.map((p) => p.fromTs)).toEqual(
      [...passes.map((p) => p.fromTs)].sort((a, b) => b - a),
    );
  });

  it('the way back is a pass in the other direction', () => {
    const route = saved();
    routeWalk(3, [[900, 0, 300], HOME_BACK]);
    const passes = routePasses(env.db, route, NOW);
    expect(passes).toHaveLength(4);
    expect(passes[0]?.direction).not.toBe(passes[1]?.direction);
    expect(passes.filter((p) => p.direction === 'backward')).toHaveLength(1);
  });

  it('a stop on the way is still the same pass, with the stop counted (R-10)', () => {
    const route = saved();
    const id = routeWalk(3, [HOME, [450, 0, 420], SHOP]);
    const pass = routePasses(env.db, route, NOW).find((p) => p.walkId === id);
    expect(pass).toBeDefined();
    expect(pass?.stops).toBe(1);
    expect(pass?.lengthM).toBeGreaterThan(850);
    // the time on foot leaves the stop out
    expect(pass?.walkingS).toBeLessThan(900 / 1.3 + 60);
    expect(passes(route).filter((p) => p.walkId === id)).toHaveLength(1);
  });

  const passes = (route: ReturnType<typeof saved>) => routePasses(env.db, route, NOW);

  it('another road is not a pass', () => {
    const route = saved();
    routeWalk(3, [
      [0, 1500, 300],
      [0, 2400, 300],
    ]);
    expect(passes(route)).toHaveLength(3);
  });

  it('tells a walk which pass of which route it was', () => {
    const route = saved();
    const walks = env.db
      .all("SELECT id FROM walk WHERE status = 'completed' ORDER BY started_at")
      .map((r) => String(r['id']));
    const last = walks[walks.length - 1] ?? '';
    const found = walkRoutePasses(env.db, last, NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ index: 3, total: 3 });
    expect(found[0]?.route.id).toBe(route.id);
    expect(walkRoutePasses(env.db, 'nope', NOW)).toEqual([]);
  });

  it('renames, lists and deletes; the walks are left as they were', () => {
    const route = saved();
    expect(renameRoute(env.db, env.ctx, route.id, ' Дорога в магазин ').name).toBe(
      'Дорога в магазин',
    );
    expect(() => renameRoute(env.db, env.ctx, route.id, '  ')).toThrow(RangeError);
    expect(listRoutes(env.db)).toHaveLength(1);
    expect(deleteRoute(env.db, env.ctx, route.id)).toBe(true);
    expect(deleteRoute(env.db, env.ctx, route.id)).toBe(false);
    expect(listRoutes(env.db)).toEqual([]);
    expect(getRoute(env.db, route.id)).toBeNull();
    expect(
      Number(env.db.all("SELECT COUNT(*) AS n FROM walk WHERE status = 'completed'")[0]?.['n']),
    ).toBe(3);
    // the way is proposed again once the route is gone
    expect(proposeRoutes(env.db, NOW)).toHaveLength(1);
  });

  it('refuses a nameless or one-point route', () => {
    expect(() =>
      createRoute(env.db, env.ctx, { name: ' ', points: [spot(0, 0), spot(500, 0)] }),
    ).toThrow(RangeError);
    expect(() => createRoute(env.db, env.ctx, { name: 'x', points: [spot(0, 0)] })).toThrow(
      RangeError,
    );
  });

  it('a round way is a loop', () => {
    const circle = Array.from({ length: 41 }, (_, i) => {
      const a = (i / 40) * 2 * Math.PI;
      return spot(150 * Math.cos(a), 150 * Math.sin(a));
    });
    expect(createRoute(env.db, env.ctx, { name: 'Круг', points: circle }).kind).toBe('loop');
  });
});
