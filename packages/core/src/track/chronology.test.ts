import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, type LatLon } from '../geo/haversine';

import {
  baseArrival,
  buildChronology,
  forgottenBaseStay,
  chronologyTitle,
  placeContaining,
  startSpotArrival,
  visitsByPlace,
  type ChronoPlace,
  type ChronoVisit,
} from './chronology';
import type { TimedPoint } from './motion';
import { findRides } from './rides';
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

  it('a visit that reaches outside the walk is cut to it, and one left too short is dropped', () => {
    const track = new Track().stand(600).walkTo(500, 0).stand(300);
    const stays = findStays(track.points);
    const inside = { startedAt: T0 + 240_000, endedAt: track.end - 200_000 };
    const steps = buildChronology(track.points, stays, [], inside);
    const first = visits(steps)[0];
    expect(first?.fromTs).toBe(inside.startedAt);
    expect(first?.durationS).toBeCloseTo((stays[0]?.toTs ?? 0) / 1000 - inside.startedAt / 1000, 0);
    expect(steps.every((s) => s.fromTs >= inside.startedAt && s.toTs <= inside.endedAt)).toBe(true);
    // the last visit has only 100 s left inside the walk: dropped
    expect(visits(steps)).toHaveLength(1);
  });

  it('a car trip between two walks is a ride of its own, with no walking length (S-9)', () => {
    const track = new Track().walkTo(300, 0).walkTo(15_000, 0, 10).walkTo(15_300, 0);
    const steps = buildChronology(
      track.points,
      [],
      [],
      { startedAt: T0, endedAt: track.end },
      {
        rides: findRides(track.points),
      },
    );
    expect(steps.map((s) => s.kind)).toEqual(['leg', 'ride', 'leg']);
    const ride = steps[1];
    expect(ride?.kind === 'ride' ? ride.lengthM : 0).toBeGreaterThan(14_500);
    const walked = steps.flatMap((s) => (s.kind === 'leg' ? [s.lengthM] : []));
    expect(Math.max(...walked)).toBeLessThan(400);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]?.fromTs ?? 0).toBeGreaterThanOrEqual(steps[i - 1]?.toTs ?? Infinity);
    }
  });

  it('a ride at the very start or end leaves no empty legs', () => {
    const track = new Track().walkTo(10_000, 0, 10);
    const steps = buildChronology(
      track.points,
      [],
      [],
      { startedAt: T0, endedAt: track.end },
      {
        rides: findRides(track.points),
      },
    );
    expect(steps.map((s) => s.kind)).toEqual(['ride']);
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

  it('the title begins and ends with the saved places the walk began and ended in', () => {
    const shop = [{ kind: 'visit', placeId: 'shop' }] as unknown as Parameters<
      typeof chronologyTitle
    >[0];
    const names = new Map([
      ['home', 'Дом'],
      ['shop', 'Магазин'],
      ['guests', 'Гости'],
    ]);
    const nameOf = (id: string) => names.get(id);
    expect(chronologyTitle(shop, nameOf, { startPlaceId: 'home', endPlaceId: 'home' })).toBe(
      'Дом → Магазин → Дом',
    );
    expect(chronologyTitle([], nameOf, { startPlaceId: 'guests', endPlaceId: 'home' })).toBe(
      'Гости → Дом',
    );
    expect(chronologyTitle([], nameOf, { startPlaceId: 'home', endPlaceId: 'home' })).toBe('Дом');
    expect(chronologyTitle([], nameOf, { startPlaceId: null, endPlaceId: 'gone' })).toBeNull();
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

describe('buildChronology: indoor marks', () => {
  const track = new Track().walkTo(300, 0).stand(900).walkTo(900, 0);
  const stays = findStays(track.points);
  const bounds = { startedAt: T0, endedAt: track.end };

  it('a visit is indoor when most of it was marked', () => {
    const visit = stays[0];
    const span = { fromTs: (visit?.fromTs ?? 0) + 60_000, toTs: (visit?.toTs ?? 0) - 60_000 };
    const marked = buildChronology(track.points, stays, [], bounds, { indoor: [span] });
    expect(visits(marked)[0]?.indoor).toBe(true);
    const half = buildChronology(track.points, stays, [], bounds, {
      indoor: [{ fromTs: visit?.fromTs ?? 0, toTs: (visit?.fromTs ?? 0) + 200_000 }],
    });
    expect(visits(half)[0]?.indoor).toBe(false);
  });

  it('without marks nothing is indoor', () => {
    expect(visits(buildChronology(track.points, stays, [], bounds)).every((v) => !v.indoor)).toBe(
      true,
    );
  });
});

describe('baseArrival', () => {
  const MOM = place('mom', 'Мама', 1200, 0, 40);
  const bases = new Set(['home', 'mom']);
  const arrival = (track: Track, places: ChronoPlace[], lastFix = track.end) =>
    baseArrival(chronology(track, places), bases, lastFix);

  it('two hours at Mom’s ask to finish, at the moment of arrival (S-4)', () => {
    const track = new Track().walkTo(1200, 0).stand(7200);
    const found = arrival(track, [HOME, MOM]);
    expect(found?.placeId).toBe('mom');
    expect(found?.stayS).toBeGreaterThan(7000);
    expect(found?.arrivedAt).toBeGreaterThan(T0 + 800_000);
    expect(found?.arrivedAt).toBeLessThan(T0 + 1_200_000);
  });

  it('eight minutes to hand something over is part of the walk (S-5)', () => {
    expect(arrival(new Track().walkTo(1200, 0).stand(480), [HOME, MOM])).toBeNull();
  });

  it('just under and just over the fifteen minutes', () => {
    expect(arrival(new Track().walkTo(1200, 0).stand(840), [MOM])).toBeNull();
    expect(arrival(new Track().walkTo(1200, 0).stand(960), [MOM])).not.toBeNull();
  });

  it('a shop is not a base, however long', () => {
    const shop = place('shop', 'Магазин', 1200, 0, 40);
    expect(arrival(new Track().walkTo(1200, 0).stand(3600), [shop])).toBeNull();
  });

  it('standing at one’s own door before setting off is not an arrival', () => {
    expect(arrival(new Track().stand(1200), [HOME])).toBeNull();
  });

  it('coming back home after the walk is an arrival', () => {
    const track = new Track().stand(300).walkTo(900, 0).walkTo(0, 0).stand(1000);
    expect(arrival(track, [HOME])?.placeId).toBe('home');
  });

  it('a stay that is over (the walk went on) asks nothing', () => {
    const track = new Track().walkTo(1200, 0).stand(1200).walkTo(2400, 0);
    expect(arrival(track, [MOM])).toBeNull();
  });

  it('an old stay does not ask once the signal has been silent for long', () => {
    const track = new Track().walkTo(1200, 0).stand(1200);
    expect(arrival(track, [MOM], track.end + 600_000)).toBeNull();
    expect(arrival(track, [MOM], track.end + 120_000)).not.toBeNull();
  });

  it('an unnamed place never asks', () => {
    expect(arrival(new Track().walkTo(1200, 0).stand(1800), [])).toBeNull();
  });
});

describe('placeContaining with contours', () => {
  const sq = (size: number, x = 0, y = 0) => [
    at(x, y),
    at(x + size, y),
    at(x + size, y + size),
    at(x, y + size),
  ];
  const parkPlace: ChronoPlace = {
    ...place('park', 'Парк', 250, 250, 100),
    boundary: sq(500),
  };

  it('a position inside the contour is in the place, however far from its centre', () => {
    expect(placeContaining(at(20, 20), [parkPlace])?.id).toBe('park');
    expect(placeContaining(at(480, 490), [parkPlace])?.id).toBe('park');
  });

  it('a few meters past the edge still count, farther does not', () => {
    expect(placeContaining(at(-10, 250), [parkPlace])?.id).toBe('park');
    expect(placeContaining(at(-30, 250), [parkPlace])).toBeNull();
  });

  it('a clearing inside the park wins over the park, the park holds the rest', () => {
    const glade = place('glade', 'Полянка', 250, 250, 50);
    expect(placeContaining(at(260, 250), [parkPlace, glade])?.id).toBe('glade');
    expect(placeContaining(at(60, 60), [parkPlace, glade])?.id).toBe('park');
  });

  it('a contour with too few vertices is ignored, the radius rules', () => {
    const odd: ChronoPlace = {
      ...place('odd', 'Двор', 0, 0, 40),
      boundary: [at(0, 0), at(10, 10)],
    };
    expect(placeContaining(at(20, 0), [odd])?.id).toBe('odd');
  });
});

describe('forgottenBaseStay', () => {
  const bases = new Set(['mom']);
  const mom = place('mom', 'Мама', 1200, 0, 40);

  it('finds a long stay in a base that the walk did not end at', () => {
    const track = new Track().walkTo(1200, 0).stand(1800).walkTo(2400, 0);
    const steps = chronology(track, [mom]);
    const found = forgottenBaseStay(steps, bases);
    expect(found?.placeId).toBe('mom');
    expect(found?.isLast).toBe(false);
    expect(found?.visit.durationS).toBeGreaterThan(1700);
  });

  it('knows when the stay is where the walk ended', () => {
    const track = new Track().walkTo(1200, 0).stand(1800);
    expect(forgottenBaseStay(chronology(track, [mom]), bases)?.isLast).toBe(true);
  });

  it('a short stay, a stay that begins the walk and a stay outside the bases are not it', () => {
    expect(
      forgottenBaseStay(chronology(new Track().walkTo(1200, 0).stand(600), [mom]), bases),
    ).toBeNull();
    expect(
      forgottenBaseStay(
        chronology(new Track().stand(1800), [place('mom', 'Мама', 0, 0, 40)]),
        bases,
      ),
    ).toBeNull();
    expect(
      forgottenBaseStay(chronology(new Track().walkTo(1200, 0).stand(1800), [mom]), new Set()),
    ).toBeNull();
    expect(forgottenBaseStay([], bases)).toBeNull();
  });
});

describe('startSpotArrival', () => {
  const START = at(0, 0);
  const farthest = (track: Track): number =>
    Math.max(
      ...track.points.map((p) =>
        Math.hypot(
          (p.lon - LON0) * M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180),
          (p.lat - LAT0) * M_PER_DEG,
        ),
      ),
    );
  const found = (track: Track, options = {}) =>
    startSpotArrival(chronology(track, []), START, farthest(track), track.end, options);

  it('back where it began for ten minutes, after going far: asks, at the moment of coming back', () => {
    const track = new Track().stand(120).walkTo(900, 0).walkTo(0, 0).stand(700);
    const arrival = found(track);
    expect(arrival?.placeId).toBe('');
    expect(arrival?.stayS).toBeGreaterThan(600);
    expect(arrival?.arrivedAt).toBeGreaterThan(T0 + 700_000);
  });

  it('under ten minutes, a short way out, another spot, or the first stay: nothing', () => {
    expect(found(new Track().stand(60).walkTo(900, 0).walkTo(0, 0).stand(500))).toBeNull();
    expect(found(new Track().stand(60).walkTo(100, 0).walkTo(0, 0).stand(900))).toBeNull();
    expect(found(new Track().stand(60).walkTo(900, 0).stand(900))).toBeNull();
    expect(found(new Track().stand(1200))).toBeNull();
  });

  it('the distances and the stay can be changed; a stale last fix is not "now"', () => {
    const track = new Track().stand(60).walkTo(900, 0).walkTo(0, 0).stand(400);
    expect(found(track, { minStayS: 300 })).not.toBeNull();
    expect(found(track, { minStayS: 300, awayM: 2000 })).toBeNull();
    expect(
      startSpotArrival(chronology(track, []), START, farthest(track), track.end + 1_000_000, {
        minStayS: 300,
      }),
    ).toBeNull();
  });
});
