import { speedProfile } from '@pawquest/core';
import type { ReplayZone, WalkReplay } from '@pawquest/data';
import { describe, expect, it } from 'vitest';

import { placeColors, routePaint, speedColor } from './replayPaint';

const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);
const M = 1 / 111_195;

/** 6 minutes along a line: 2 min slow (0.6 m/s), 2 min walk (1.3 m/s), 2 min fast (2.2 m/s). */
function replay(zones: ReplayZone[] = []): WalkReplay {
  let north = 0;
  const points = Array.from({ length: 361 }, (_, i) => {
    const speed = i < 120 ? 0.6 : i < 240 ? 1.3 : 2.2;
    north += speed;
    return { ts: T0 + i * 1000, lat: 55 + north * M, lon: 37 + (i % 2) * 1e-6, speedMps: speed };
  });
  return {
    walkId: 'w',
    startTs: T0,
    endTs: T0 + 360_000,
    points,
    cumulativeM: points.map((_, i) => i),
    line: [],
    paused: [],
    events: [],
    photos: [],
    passes: [],
    zones,
    profile: speedProfile(points),
  };
}

const zone = (placeId: string, from: number, to: number, name = placeId): ReplayZone => ({
  placeId,
  name,
  category: 'park',
  fromTs: T0 + from * 1000,
  toTs: T0 + to * 1000,
});

describe('routePaint by speed', () => {
  it('the route is cut where the pace changes, with the colour of each zone and the real time of each in the legend', () => {
    const paint = routePaint(replay(), 'speed', 'light');
    expect(paint.segments.map((s) => s.key)).toEqual(['slow', 'walk', 'fast']);
    expect(paint.segments[0]?.color).toBe(speedColor('slow', 'light'));
    expect(paint.legend.map((l) => l.key).sort()).toEqual(['fast', 'slow', 'walk']);
    const total = paint.legend.reduce((sum, l) => sum + l.seconds, 0);
    expect(total).toBeGreaterThan(355);
    expect(total).toBeLessThanOrEqual(360);
  });

  it('neighbouring stretches share their end point, so the line has no holes', () => {
    const { segments } = routePaint(replay(), 'speed', 'light');
    for (let i = 1; i < segments.length; i += 1) {
      const before = segments[i - 1]?.coordinates;
      const first = segments[i]?.coordinates[0];
      expect(before?.[before.length - 1]).toEqual(first);
    }
    expect(segments.every((s) => s.coordinates.length >= 2 && s.t1 > s.t0)).toBe(true);
  });

  it('without a speed profile everything is standing; the dark scheme has its own colours', () => {
    const paint = routePaint({ ...replay(), profile: null }, 'speed', 'dark');
    expect(paint.segments).toHaveLength(1);
    expect(paint.segments[0]?.color).toBe(speedColor('standing', 'dark'));
    expect(speedColor('run', 'dark')).not.toBe(speedColor('run', 'light'));
  });
});

describe('routePaint by place', () => {
  const zones = [zone('park', 100, 300), zone('glade', 150, 200)];

  it('outside, in the park, in the glade (the innermost), in the park again, outside again', () => {
    const paint = routePaint(replay(zones), 'places', 'light');
    expect(paint.segments.map((s) => s.key)).toEqual([
      'outside',
      'park',
      'glade',
      'park',
      'outside',
    ]);
    expect(paint.legend.find((l) => l.key === 'glade')?.seconds).toBeGreaterThan(40);
    expect(paint.legend.find((l) => l.key === 'outside')).toBeDefined();
  });

  it('places get a colour each, in the order met; the walk with no places is all "outside"', () => {
    const colors = placeColors(zones, 'light');
    expect([...colors.keys()]).toEqual(['park', 'glade']);
    expect(colors.get('park')).not.toBe(colors.get('glade'));
    const none = routePaint(replay(), 'places', 'light');
    expect(none.segments.map((s) => s.key)).toEqual(['outside']);
  });

  it('more places than colours reuse the palette; plain and tiny tracks paint nothing', () => {
    const many = Array.from({ length: 11 }, (_, i) => zone(`p${String(i)}`, i * 10, i * 10 + 5));
    expect(placeColors(many, 'dark').size).toBe(11);
    expect(routePaint(replay(), 'plain', 'light')).toEqual({ segments: [], legend: [] });
    expect(
      routePaint({ ...replay(), points: replay().points.slice(0, 1) }, 'speed', 'light').segments,
    ).toEqual([]);
  });
});
