import { describe, expect, it } from 'vitest';

import { EARTH_RADIUS_M, haversineDistanceM } from '../geo/haversine';

import { DEFAULT_STAY_SCALES, findStays, type Stay, type StayPoint } from './stays';

const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const COS = Math.cos((55 * Math.PI) / 180);
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0);

function at(north: number, east: number): { lat: number; lon: number } {
  return { lat: 55 + north / M_PER_DEG, lon: 37 + east / (M_PER_DEG * COS) };
}

/** Small deterministic generator (mulberry32). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a GPS track piece by piece, one point per second. */
class Walk {
  readonly points: StayPoint[] = [];
  private n = 0;
  private e = 0;
  private t = T0;
  private readonly rand: () => number;

  constructor(seed = 1) {
    this.rand = random(seed);
  }

  private push(n: number, e: number, accuracyM: number): void {
    this.points.push({ ts: this.t, ...at(n, e), accuracyM });
    this.t += 1000;
  }

  /** Stands near the current spot; `jitterM` is the GPS noise. */
  stand(seconds: number, jitterM = 2, accuracyM = 5): this {
    for (let i = 0; i < seconds; i++) {
      this.push(
        this.n + (this.rand() - 0.5) * 2 * jitterM,
        this.e + (this.rand() - 0.5) * 2 * jitterM,
        accuracyM,
      );
    }
    return this;
  }

  /** Walks in a straight line to a spot at the given speed. */
  walkTo(n: number, e: number, speed = 1.2): this {
    const distance = Math.hypot(n - this.n, e - this.e);
    const steps = Math.max(1, Math.round(distance / speed));
    const n0 = this.n;
    const e0 = this.e;
    for (let i = 1; i <= steps; i++) {
      this.push(n0 + ((n - n0) * i) / steps, e0 + ((e - e0) * i) / steps, 5);
    }
    this.n = n;
    this.e = e;
    return this;
  }

  /** Walks around inside a disc of `radius` meters around the current spot. */
  wander(radius: number, seconds: number, speed = 0.8): this {
    const cn = this.n;
    const ce = this.e;
    let heading = this.rand() * Math.PI * 2;
    for (let i = 0; i < seconds; i++) {
      heading += (this.rand() - 0.5) * 1.2;
      const fromCentre = Math.hypot(this.n - cn, this.e - ce);
      if (fromCentre > radius * 0.8) {
        heading = Math.atan2(cn - this.n, ce - this.e);
      }
      this.n += Math.sin(heading) * speed;
      this.e += Math.cos(heading) * speed;
      this.push(this.n, this.e, 5);
    }
    return this;
  }

  /** Moves to another spot without any points (the signal was lost on the way). */
  jump(n: number, e: number): this {
    this.n = n;
    this.e = e;
    return this;
  }

  /** No points for a while (signal lost). */
  gap(seconds: number): this {
    this.t += seconds * 1000;
    return this;
  }

  get now(): number {
    return this.t;
  }
}

/** A value a test relies on being there. */
function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('expected a value');
  }
  return value;
}

const distanceTo = (stay: Stay, north: number, east: number): number =>
  haversineDistanceM(stay, at(north, east));

describe('findStays: standing', () => {
  it('standing for 5 minutes is one small stay at that spot', () => {
    const track = new Walk().walkTo(0, 200).stand(300).walkTo(0, 500).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(1);
    const [stay] = stays;
    expect(stay?.scale).toBe('small');
    // 300 s of standing; the last few meters of walking in and out may stay (GPS noise is a few meters)
    expect(stay?.durationS).toBeGreaterThanOrEqual(295);
    expect(stay?.durationS).toBeLessThanOrEqual(315);
    expect(distanceTo(must(stay), 0, 200)).toBeLessThan(3);
    expect(stay?.radiusM).toBeLessThan(4);
  });

  it('the approach and the departure are trimmed off', () => {
    const track = new Walk().walkTo(0, 30).stand(240).walkTo(0, 60).points;
    const [stay] = findStays(track);
    // 30 m of walking in and out (25 s each) would add ~50 s if it were included
    expect(stay?.durationS).toBeLessThan(262);
    expect(stay?.durationS).toBeGreaterThan(238);
  });

  it('exactly 180 s counts, 170 s does not', () => {
    expect(findStays(new Walk().stand(181).points)).toHaveLength(1);
    expect(findStays(new Walk().stand(171).points)).toHaveLength(0);
  });

  it('walking past at a steady pace is no stay', () => {
    expect(findStays(new Walk().walkTo(0, 2000).points)).toEqual([]);
  });

  it('a 20 s pause at a crossing is no stay', () => {
    const track = new Walk().walkTo(0, 300).stand(20).walkTo(0, 600).points;
    expect(findStays(track)).toEqual([]);
  });

  it('two stands far apart are two stays in time order', () => {
    const track = new Walk().stand(240).walkTo(0, 400).stand(300).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(2);
    expect(stays[0]?.fromTs).toBeLessThan(stays[1]?.fromTs ?? 0);
    expect(distanceTo(must(stays[0]), 0, 0)).toBeLessThan(3);
    expect(distanceTo(must(stays[1]), 0, 400)).toBeLessThan(3);
  });

  it('a slow sniffing walk (0.3 m/s) within a few meters counts as a stay', () => {
    const [stay] = findStays(new Walk(7).wander(8, 360, 0.3).points);
    expect(stay?.scale).toBe('small');
    expect(stay?.durationS).toBeGreaterThan(300);
  });
});

describe('findStays: moving around inside an area', () => {
  it('circling a clearing for 15 minutes is one stay, where an A-03 stop would see nothing', () => {
    const track = new Walk(3).walkTo(0, 100).wander(30, 900, 0.9).walkTo(0, 400).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.durationS).toBeGreaterThan(800);
    expect(distanceTo(must(stays[0]), 0, 100)).toBeLessThan(25);
    expect(stays[0]?.radiusM).toBeGreaterThan(8);
  });

  it('a big park walk is a large stay and the stand inside it is an inner stay', () => {
    const walk = new Walk(5).walkTo(0, 50).wander(110, 400, 0.9);
    // a long stand at the current spot, then more wandering
    const track = walk.stand(300).wander(110, 400, 0.9).points;
    const stays = findStays(track);
    expect(stays.length).toBeGreaterThanOrEqual(1);
    const top = stays.reduce((a, b) => (a.durationS >= b.durationS ? a : b));
    expect(top.scale === 'large' || top.scale === 'medium').toBe(true);
    expect(top.durationS).toBeGreaterThan(1000);
    expect(top.inner.length).toBeGreaterThanOrEqual(1);
    for (const inner of top.inner) {
      expect(inner.fromTs).toBeGreaterThanOrEqual(top.fromTs);
      expect(inner.toTs).toBeLessThanOrEqual(top.toTs);
      expect(inner.durationS).toBeLessThan(top.durationS);
    }
  });

  it('standing for 20 minutes is one small stay, not a large one with a copy inside', () => {
    const stays = findStays(new Walk().stand(1200).points);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.scale).toBe('small');
    expect(stays[0]?.inner).toEqual([]);
  });

  it('wandering in a 250 m area for 20 minutes is a large stay', () => {
    const stays = findStays(new Walk(9).wander(200, 1200, 1.2).points);
    expect(stays.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...stays.map((s) => s.durationS))).toBeGreaterThan(900);
  });
});

describe('findStays: signal and noise', () => {
  it('a lost signal while standing is bridged and reported', () => {
    // 3 min at the door, 8 min without signal inside, 2 min at the door again
    const track = new Walk().stand(180).gap(480).stand(120).points;
    const [stay] = findStays(track);
    expect(stay?.durationS).toBeGreaterThan(700);
    expect(stay?.gapS).toBeGreaterThan(400);
  });

  it('a silence is not bridged when the position changed afterwards', () => {
    // 200 s at one spot, 10 minutes of silence, then the signal returns 300 m away
    const track = new Walk().stand(200).gap(600).jump(0, 300).stand(200).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(2);
    expect(stays.every((s) => s.gapS === 0)).toBe(true);
  });

  it('a silence is bridged when the person is still at the same spot afterwards', () => {
    const track = new Walk().stand(200).gap(600).stand(200).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.gapS).toBeGreaterThan(590);
    expect(stays[0]?.durationS).toBeGreaterThan(990);
  });

  it('a very long silence is not bridged', () => {
    const track = new Walk()
      .stand(200)
      .gap(3 * 3600)
      .stand(200).points;
    expect(findStays(track)).toHaveLength(2);
  });

  it('one wild GPS point does not end a stay', () => {
    const base = new Walk().stand(300).points;
    const wild = base.map((p, i) => (i === 150 ? { ...p, ...at(120, 120) } : p));
    const stays = findStays(wild);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.durationS).toBeGreaterThan(290);
  });

  it('a long run of bad points ends the stay (three skips at most)', () => {
    const base = new Walk().stand(600).points;
    const broken = base.map((p, i) => (i >= 300 && i < 310 ? { ...p, ...at(500, 500) } : p));
    const stays = findStays(broken);
    expect(stays.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...stays.map((s) => s.durationS))).toBeLessThan(600);
  });

  it('points with poor accuracy are ignored, good ones around them still make the stay', () => {
    const base = new Walk().stand(300).points;
    const noisy = base.map((p, i) => (i % 10 === 5 ? { ...p, ...at(200, 0), accuracyM: 90 } : p));
    const stays = findStays(noisy);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.durationS).toBeGreaterThan(280);
  });

  it('a track hovering at the edge of the radius gives sane stays, not a flicker', () => {
    // moves between 38 m and 44 m from a centre
    const points: StayPoint[] = [];
    for (let i = 0; i < 600; i++) {
      const radius = 38 + 6 * Math.abs(Math.sin(i / 7));
      const angle = i / 20;
      points.push({
        ts: T0 + i * 1000,
        ...at(Math.sin(angle) * radius, Math.cos(angle) * radius),
        accuracyM: 5,
      });
    }
    const stays = findStays(points);
    expect(stays.length).toBeLessThanOrEqual(2);
    expect(Math.max(...stays.map((s) => s.durationS))).toBeGreaterThan(400);
  });

  it('denser points (5 per second) give the same stay as one per second', () => {
    const slow = new Walk(2).stand(300).points;
    const dense: StayPoint[] = [];
    for (const p of slow) {
      for (let k = 0; k < 5; k++) {
        dense.push({ ...p, ts: p.ts + k * 200 });
      }
    }
    const a = findStays(slow);
    const b = findStays(dense);
    expect(b).toHaveLength(a.length);
    expect(b[0]?.durationS).toBeCloseTo(a[0]?.durationS ?? 0, -1);
  });
});

describe('findStays: realistic cases', () => {
  it('GPS wandering by a few meters while standing for 10 minutes is one small stay', () => {
    const [stay] = findStays(new Walk(21).stand(600, 6, 12).points);
    expect(stay?.scale).toBe('small');
    expect(stay?.durationS).toBeGreaterThan(590);
    expect(stay?.radiusM).toBeLessThan(10);
  });

  it('standing, shifting 15 m, standing again is one stay, not two', () => {
    const track = new Walk().stand(200).walkTo(0, 15).stand(200).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(1);
    expect(stays[0]?.durationS).toBeGreaterThan(400);
  });

  it('coming back to the same spot after a walk is two visits at one place', () => {
    const track = new Walk().stand(200).walkTo(0, 300).walkTo(0, 0).stand(200).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(2);
    expect(haversineDistanceM(must(stays[0]), must(stays[1]))).toBeLessThan(5);
  });

  it('works on points without an accuracy value', () => {
    const track = new Walk().stand(300).points.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon }));
    expect(findStays(track)).toHaveLength(1);
  });

  it('a stay is found at any place of a long walk, not just the start', () => {
    const track = new Walk(8)
      .walkTo(0, 800)
      .walkTo(300, 800)
      .stand(240)
      .walkTo(300, 1500)
      .walkTo(0, 1500).points;
    const stays = findStays(track);
    expect(stays).toHaveLength(1);
    expect(distanceTo(must(stays[0]), 300, 800)).toBeLessThan(4);
  });

  it('custom scales are honoured: a stricter minimum drops a shorter stay', () => {
    const track = new Walk().stand(240).points;
    const strict = [{ name: 'small' as const, radiusM: 40, minS: 300 }];
    expect(findStays(track)).toHaveLength(1);
    expect(findStays(track, { scales: strict })).toEqual([]);
  });
});

describe('findStays: manual pauses', () => {
  it('a pause never lies inside a stay: the stay stops at it and does not join the far side', () => {
    const track = new Walk().stand(600).points;
    const pause = { fromTs: T0 + 290_000, toTs: T0 + 310_000 };
    const stays = findStays(track, { pausedIntervals: [pause] });
    expect(stays).toHaveLength(2);
    expect(stays[0]?.toTs).toBeLessThan(pause.fromTs);
    expect(stays[1]?.fromTs).toBeGreaterThan(pause.toTs);
  });

  it('a pause during which nothing was recorded still splits a stay', () => {
    const all = new Walk().stand(600).points;
    const pause = { fromTs: T0 + 285_000, toTs: T0 + 315_000 };
    // the app records nothing while paused, so there are no points inside the pause at all
    const recorded = all.filter((q) => q.ts < pause.fromTs || q.ts > pause.toTs);
    const stays = findStays(recorded, { pausedIntervals: [pause] });
    expect(stays).toHaveLength(2);
    expect(stays[1]?.fromTs).toBeGreaterThan(pause.toTs);
  });

  it('a pause that covers a whole stand leaves no stay', () => {
    const track = new Walk().walkTo(0, 100).stand(300).walkTo(0, 300).points;
    const pause = { fromTs: T0 + 80_000, toTs: T0 + 400_000 };
    expect(findStays(track, { pausedIntervals: [pause] })).toEqual([]);
  });
});

describe('findStays: where scales meet', () => {
  // A stand that sits right at the edge of a wider area: the wide stay reaches only part of it.
  // Whatever happens, the result must stay clean: ordered, non-overlapping, inner stays inside.
  it('stands at the edge of a wandering area never produce overlapping stays', () => {
    let partial = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const rand = random(seed * 104_729);
      const walk = new Walk(seed).wander(60 + rand() * 90, 700 + Math.floor(rand() * 400), 0.8);
      const angle = rand() * Math.PI * 2;
      const reach = 110 + rand() * 80;
      walk
        .walkTo(Math.sin(angle) * reach, Math.cos(angle) * reach)
        .stand(200 + Math.floor(rand() * 300), 1);
      const stays = findStays(walk.points, {
        scales: [
          { name: 'large', radiusM: 150, minS: 600 },
          { name: 'small', radiusM: 30, minS: 150 },
        ],
      });
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const stay of stays) {
        expect(stay.fromTs, `seed ${String(seed)}`).toBeGreaterThanOrEqual(previousEnd);
        previousEnd = stay.toTs;
        for (const inner of stay.inner) {
          expect(inner.fromTs).toBeGreaterThanOrEqual(stay.fromTs);
          expect(inner.toTs).toBeLessThanOrEqual(stay.toTs);
        }
      }
      if (stays.length >= 2) {
        partial += 1;
      }
    }
    // at least some of the tracks must have ended with a large stay and a separate stand
    expect(partial).toBeGreaterThan(5);
  }, 60_000);
});

describe('findStays: fuzzing with garbage', () => {
  it('never throws on valid but wild input and keeps its invariants', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = random(seed * 15_485_863);
      const points: StayPoint[] = [];
      let ts = T0;
      let lat = 55 + rand() * 0.01;
      let lon = 37 + rand() * 0.01;
      const count = 50 + Math.floor(rand() * 900);
      for (let i = 0; i < count; i++) {
        ts += 1000 + Math.floor(rand() * rand() * 400_000); // mostly 1 s, sometimes minutes
        const roll = rand();
        if (roll < 0.05) {
          lat = -80 + rand() * 160; // teleport anywhere
          lon = -170 + rand() * 340;
        } else if (roll < 0.5) {
          lat += (rand() - 0.5) * 0.0004; // wander
          lon += (rand() - 0.5) * 0.0006;
        }
        points.push({
          ts,
          lat,
          lon,
          accuracyM: roll > 0.9 ? 200 : rand() < 0.2 ? undefined : rand() * 30,
        });
      }
      const pauses =
        rand() < 0.5 ? [{ fromTs: T0 + 100_000, toTs: T0 + 100_000 + rand() * 600_000 }] : [];
      const stays = findStays(points, { pausedIntervals: pauses });
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const stay of stays) {
        expect(Number.isFinite(stay.lat) && Number.isFinite(stay.lon), `seed ${String(seed)}`).toBe(
          true,
        );
        expect(stay.fromTs).toBeGreaterThanOrEqual(previousEnd);
        expect(stay.durationS).toBeGreaterThanOrEqual(180 - 1e-9);
        expect(stay.radiusM).toBeGreaterThanOrEqual(0);
        expect(stay.gapS).toBeGreaterThanOrEqual(0);
        for (const pause of pauses) {
          // a stay never reaches across a pause
          expect(stay.fromTs < pause.fromTs && stay.toTs > pause.toTs).toBe(false);
        }
        previousEnd = stay.toTs;
      }
    }
  }, 60_000);

  it('does not fail near the poles or across the antimeridian', () => {
    const polar: StayPoint[] = Array.from({ length: 300 }, (_, i) => ({
      ts: T0 + i * 1000,
      lat: 89.9999,
      lon: 10 + (i % 2) * 0.0001,
    }));
    expect(() => findStays(polar)).not.toThrow();
    const wrap: StayPoint[] = Array.from({ length: 300 }, (_, i) => ({
      ts: T0 + i * 1000,
      lat: 10,
      lon: i % 2 === 0 ? 179.99999 : -179.99999,
    }));
    expect(() => findStays(wrap)).not.toThrow();
  });
});

describe('findStays: input handling and properties', () => {
  it('handles no points, one point and two points', () => {
    expect(findStays([])).toEqual([]);
    expect(findStays(new Walk().stand(1).points)).toEqual([]);
    expect(findStays(new Walk().stand(2).points)).toEqual([]);
  });

  it('rejects unsorted time, repeated time and impossible coordinates', () => {
    const [a, b] = new Walk().stand(2).points;
    expect(() => findStays([must(b), must(a)])).toThrow(RangeError);
    expect(() => findStays([must(a), must(a)])).toThrow(RangeError);
    expect(() => findStays([{ ...must(a), lat: 91 }])).toThrow(RangeError);
    expect(() => findStays([{ ...must(a), ts: Number.NaN }])).toThrow(RangeError);
  });

  it('is deterministic and does not change its input', () => {
    const points = new Walk(11).stand(300).walkTo(0, 400).wander(30, 600).points;
    const copy = structuredClone(points);
    expect(findStays(points)).toEqual(findStays(points));
    expect(points).toEqual(copy);
  });

  it('shifting the whole track in time or space gives the same stays', () => {
    const points = new Walk(4).stand(300).walkTo(0, 400).stand(240).points;
    const base = findStays(points);
    const later = findStays(points.map((p) => ({ ...p, ts: p.ts + 3_600_000 })));
    const moved = findStays(points.map((p) => ({ ...p, lat: p.lat + 0.01, lon: p.lon + 0.02 })));
    expect(later.map((s) => s.durationS)).toEqual(base.map((s) => s.durationS));
    expect(moved.map((s) => s.durationS)).toEqual(base.map((s) => s.durationS));
    expect(moved).toHaveLength(base.length);
  });

  it('random scenarios keep the invariants', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = random(seed * 7919);
      const walk = new Walk(seed);
      const pieces = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < pieces; k++) {
        const kind = Math.floor(rand() * 4);
        if (kind === 0) {
          walk.stand(60 + Math.floor(rand() * 500));
        } else if (kind === 1) {
          walk.walkTo((rand() - 0.5) * 600, (rand() - 0.5) * 600);
        } else if (kind === 2) {
          walk.wander(10 + rand() * 150, 120 + Math.floor(rand() * 700), 0.4 + rand());
        } else {
          walk.gap(Math.floor(rand() * 900));
        }
      }
      const stays = findStays(walk.points);
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const s of stays) {
        expect(s.fromTs, `seed ${String(seed)}`).toBeGreaterThanOrEqual(previousEnd);
        expect(s.toTs).toBeGreaterThan(s.fromTs);
        expect(s.durationS).toBeCloseTo((s.toTs - s.fromTs) / 1000, 6);
        expect(s.durationS).toBeGreaterThanOrEqual(180 - 1e-9);
        expect(s.radiusM).toBeLessThanOrEqual(DEFAULT_STAY_SCALES[0]?.radiusM ?? 300);
        expect(s.pointCount).toBeGreaterThanOrEqual(2);
        for (const inner of s.inner) {
          expect(inner.fromTs).toBeGreaterThanOrEqual(s.fromTs);
          expect(inner.toTs).toBeLessThanOrEqual(s.toTs);
        }
        previousEnd = s.toTs;
      }
    }
  }, 60_000);

  it('twenty thousand points are processed quickly', () => {
    const rand = random(99);
    const walk = new Walk(99);
    while (walk.points.length < 20_000) {
      if (rand() < 0.2) {
        walk.stand(100 + Math.floor(rand() * 400));
      } else {
        walk.walkTo((rand() - 0.5) * 3000, (rand() - 0.5) * 3000);
      }
    }
    const started = performance.now();
    const stays = findStays(walk.points);
    const elapsed = performance.now() - started;
    expect(stays.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(3000);
  });
});
