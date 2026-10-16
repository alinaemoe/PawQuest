import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, type LatLon } from '../geo/haversine';

import {
  buildChronology,
  chronologyTitle,
  placeContaining,
  visitsByPlace,
  type ChronoPlace,
  type ChronoVisit,
} from './chronology';
import type { TimedPoint } from './motion';
import { findStays } from './stays';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const LAT0 = 55;
const LON0 = 37;
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

/** A position `x` meters east and `y` meters north of the origin. */
const at = (x: number, y: number): LatLon => ({
  lat: LAT0 + y / M_PER_DEG,
  lon: LON0 + x / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180)),
});

/** Builds a track from "stand here for so long" and "walk there" pieces, a fix every 5 s. */
class Track {
  readonly points: TimedPoint[] = [];
  private x = 0;
  private y = 0;
  private t = T0;

  constructor() {
    this.fix();
  }

  private fix(): void {
    this.points.push({ ...at(this.x, this.y), ts: this.t });
  }

  stand(seconds: number): this {
    for (let s = 5; s <= seconds; s += 5) {
      this.t += 5000;
      // a deterministic shiver of a couple of meters, like a real fix
      this.x += s % 10 === 0 ? 1.5 : -1.5;
      this.fix();
    }
    return this;
  }

  walkTo(x: number, y: number, speed = 1.3): this {
    const distance = Math.hypot(x - this.x, y - this.y);
    const steps = Math.max(1, Math.round(distance / (speed * 5)));
    const fromX = this.x;
    const fromY = this.y;
    for (let i = 1; i <= steps; i += 1) {
      this.t += 5000;
      this.x = fromX + ((x - fromX) * i) / steps;
      this.y = fromY + ((y - fromY) * i) / steps;
      this.fix();
    }
    return this;
  }

  get end(): number {
    return this.t;
  }
}

const place = (id: string, name: string, x: number, y: number, radiusM: number): ChronoPlace => ({
  id,
  name,
  ...at(x, y),
  radiusM,
});

const chronology = (track: Track, places: readonly ChronoPlace[], options = {}) =>
  buildChronology(
    track.points,
    findStays(track.points),
    places,
    { startedAt: T0, endedAt: track.end },
    options,
  );

const visits = (steps: ReturnType<typeof chronology>): ChronoVisit[] =>
  steps.filter((s): s is ChronoVisit => s.kind === 'visit');

const HOME = place('home', 'Дом', 0, 0, 40);
const SHOP = place('shop', 'Магазин', 600, 0, 40);
const PARK = place('park', 'Парк', 1500, 200, 300);

describe('placeContaining', () => {
  it('takes the nearest place whose radius holds the position', () => {
    const wide = place('wide', 'Район', 0, 0, 400);
    const narrow = place('narrow', 'Двор', 50, 0, 60);
    expect(placeContaining(at(45, 0), [wide, narrow])?.id).toBe('narrow');
    expect(placeContaining(at(-300, 0), [wide, narrow])?.id).toBe('wide');
    expect(placeContaining(at(900, 0), [wide, narrow])).toBeNull();
  });

  it('a tiny place still reaches 40 m, not further', () => {
    const tiny = place('tiny', 'Скамейка', 0, 0, 10);
    expect(placeContaining(at(35, 0), [tiny])?.id).toBe('tiny');
    expect(placeContaining(at(45, 0), [tiny])).toBeNull();
    expect(placeContaining(at(45, 0), [tiny], 60)?.id).toBe('tiny');
  });

  it('nothing without places', () => {
    expect(placeContaining(at(0, 0), [])).toBeNull();
  });
});

describe('buildChronology: home, shop, park, home (S-2)', () => {
  const track = new Track()
    .stand(600) // at the door
    .walkTo(600, 0)
    .stand(420) // the shop
    .walkTo(1500, 200)
    .stand(1200) // the park
    .walkTo(0, 0);
  const steps = chronology(track, [HOME, SHOP, PARK]);

  it('lists visits and legs in order, a leg between any two visits', () => {
    expect(steps.map((s) => s.kind)).toEqual(['visit', 'leg', 'visit', 'leg', 'visit', 'leg']);
    expect(visits(steps).map((v) => v.placeId)).toEqual(['home', 'shop', 'park']);
  });

  it('steps follow each other without overlapping and stay inside the walk', () => {
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]?.fromTs ?? 0).toBeGreaterThanOrEqual(steps[i - 1]?.toTs ?? Infinity);
    }
    expect(steps[0]?.fromTs).toBeGreaterThanOrEqual(T0);
    expect(steps[steps.length - 1]?.toTs).toBeLessThanOrEqual(track.end);
  });

  it('legs carry the walked length', () => {
    const legs = steps.flatMap((s) => (s.kind === 'leg' ? [s] : []));
    expect(legs[0]?.lengthM).toBeGreaterThan(500);
    expect(legs[0]?.lengthM).toBeLessThan(700);
    expect(legs[2]?.lengthM).toBeGreaterThan(1400);
  });

  it('gives the title of the walk by its places', () => {
    const names = new Map([HOME, SHOP, PARK].map((p) => [p.id, p.name]));
    expect(chronologyTitle(steps, (id) => names.get(id))).toBe('Дом → Магазин → Парк');
  });

  it('is the same every time', () => {
    expect(chronology(track, [HOME, SHOP, PARK])).toEqual(steps);
  });
});

describe('buildChronology: other shapes', () => {
  it('two visits to one clearing are two visits (S-6)', () => {
    const meadow = place('meadow', 'Полянка', 400, 0, 50);
    const track = new Track().walkTo(400, 0).stand(420).walkTo(2000, 0).walkTo(400, 0).stand(420);
    const steps = chronology(track, [meadow]);
    // the long trip out and back may add its own unnamed visit; the clearing is visited twice
    expect(visits(steps).filter((v) => v.placeId === 'meadow')).toHaveLength(2);
    expect(visitsByPlace(steps).get('meadow')).toBe(2);
    expect(chronologyTitle(steps, () => 'Полянка')).toBe('Полянка');
  });

  it('a stay outside every saved place is an unnamed visit', () => {
    const track = new Track().walkTo(300, 300).stand(400);
    const steps = chronology(track, [HOME]);
    expect(visits(steps)).toHaveLength(1);
    expect(visits(steps)[0]?.placeId).toBeNull();
    expect(chronologyTitle(steps, () => 'x')).toBeNull();
  });

  it('a walk without stays is one leg of the whole length', () => {
    const track = new Track().walkTo(1000, 0);
    const steps = chronology(track, [HOME]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'leg', fromTs: T0 });
    expect(steps[0]?.kind === 'leg' ? steps[0].lengthM : 0).toBeGreaterThan(990);
  });

  it('a leg shorter than the minimum is not shown', () => {
    const track = new Track().stand(240).walkTo(400, 0).stand(240);
    const normal = chronology(track, []);
    expect(normal.filter((s) => s.kind === 'leg')).toHaveLength(1);
    const strict = chronology(track, [], { minLegS: 600 });
    expect(strict.filter((s) => s.kind === 'leg')).toHaveLength(0);
    expect(visits(strict)).toHaveLength(2);
  });

  it('an empty track has one leg for the whole walk, or nothing when it is too short', () => {
    expect(buildChronology([], [], [], { startedAt: T0, endedAt: T0 + 600_000 })).toEqual([
      { kind: 'leg', fromTs: T0, toTs: T0 + 600_000, durationS: 600, lengthM: 0 },
    ]);
    expect(buildChronology([], [], [], { startedAt: T0, endedAt: T0 + 30_000 })).toEqual([]);
  });

  it('the title does not repeat a place in a row and skips unknown names', () => {
    const steps = [
      { kind: 'visit', placeId: 'a' },
      { kind: 'visit', placeId: 'a' },
      { kind: 'visit', placeId: 'gone' },
      { kind: 'visit', placeId: null },
      { kind: 'visit', placeId: 'b' },
      { kind: 'visit', placeId: 'a' },
    ] as unknown as Parameters<typeof chronologyTitle>[0];
    const names = new Map([
      ['a', 'А'],
      ['b', 'Б'],
    ]);
    expect(chronologyTitle(steps, (id) => names.get(id))).toBe('А → Б → А');
  });
});
