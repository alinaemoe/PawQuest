import { speedProfile } from '@pawquest/core';
import type { WalkReplay } from '@pawquest/data';
import { describe, expect, it } from 'vitest';

import { makeReplayEngine } from './replayEngine';

const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);
const M = 6.5 / 111_195; // 6.5 m of latitude: 5 s at 1.3 m/s

/** 20 minutes along a line, a fix every 5 s, a pause 600-720 s, events at 300 s and 1000 s, a photo at 900 s. */
function replay(): WalkReplay {
  // nothing is recorded during a pause: no fixes between 600 s and 720 s
  const points = Array.from({ length: 241 }, (_, i) => ({
    ts: T0 + i * 5000,
    lat: 55 + i * M,
    lon: 37,
    speedMps: 1.3,
    index: i,
  })).filter((p) => p.ts < T0 + 600_000 || p.ts >= T0 + 720_000);
  const paused = [{ fromTs: T0 + 600_000, toTs: T0 + 720_000 }];
  return {
    walkId: 'w',
    startTs: T0,
    endTs: T0 + 1_200_000,
    points,
    cumulativeM: points.map((p) => p.index * 6.5),
    line: [],
    paused,
    events: [
      { id: 'e1', typeId: 'dog', ts: T0 + 300_000, reaction: 3 },
      { id: 'e2', typeId: 'hard', ts: T0 + 1_000_000, reaction: null },
    ],
    photos: [{ id: 'p1', uri: 'file:///a.jpg', takenAt: T0 + 900_000 }],
    passes: [
      {
        routeId: 'r',
        routeName: 'Прямая',
        fromTs: T0 + 100_000,
        toTs: T0 + 400_000,
        direction: 'forward',
      },
    ],
    zones: [
      { placeId: 'park', name: 'Парк', category: 'park', fromTs: T0 + 250_000, toTs: T0 + 450_000 },
    ],
    profile: speedProfile(points, { pausedRanges: paused }),
  };
}

describe('makeReplayEngine', () => {
  it('on the moving axis the pause is skipped: shorter, and the marker does not wait', () => {
    const engine = makeReplayEngine(replay(), 'moving');
    expect(engine.lengthMs).toBe(1_075_000); // the pause and the gap before it, 125 s
    expect(engine.hidden).toEqual([]);
    const before = engine.frameAt(594_000);
    const after = engine.frameAt(596_000);
    expect(after.wallTs - before.wallTs).toBeGreaterThan(100_000); // jumped over the pause
  });

  it('on the real axis the pause is a stretch where the marker stays and the speed is unknown', () => {
    const engine = makeReplayEngine(replay(), 'real');
    expect(engine.lengthMs).toBe(1_200_000);
    expect(engine.hidden).toHaveLength(1);
    const a = engine.frameAt(650_000);
    const b = engine.frameAt(700_000);
    expect(a.lat).toBe(b.lat);
    expect(a.speedMps).toBeNull();
    expect(a.zone).toBe('standing');
  });

  it('a frame: the position, the distance so far, the speed and the events so far', () => {
    const engine = makeReplayEngine(replay(), 'real');
    const early = engine.frameAt(100_000);
    expect(early.distanceM).toBeCloseTo(130, 6);
    expect(early.speedMps).toBeCloseTo(1.3, 6);
    expect(early.zone).toBe('walk');
    expect(early.eventsSoFar).toBe(0);
    expect(early.pass?.routeName).toBe('Прямая');
    const late = engine.frameAt(1_150_000);
    expect(late.eventsSoFar).toBe(2);
    expect(late.pass).toBeNull();
    const ends = [engine.frameAt(-5), engine.frameAt(9e9)];
    expect(ends[0]?.distanceM).toBe(0);
    expect(ends[1]?.distanceM).toBeCloseTo(1560, 6);
  });

  it('ticks for events and photos in order, route stretches, and jumps between events', () => {
    const engine = makeReplayEngine(replay(), 'real');
    expect(engine.ticks.map((t) => [t.kind, t.key])).toEqual([
      ['event', 'e1'],
      ['photo', 'p1'],
      ['event', 'e2'],
    ]);
    expect(engine.ticks[0]?.at).toBeCloseTo(0.25, 10);
    expect(engine.passes[0]).toMatchObject({ from: 100 / 1200, to: 400 / 1200 });
    expect(engine.nextEventMs(0)).toBe(300_000);
    expect(engine.nextEventMs(300_000)).toBe(1_000_000);
    expect(engine.nextEventMs(1_000_000)).toBeNull();
    expect(engine.previousEventMs(1_000_000)).toBe(300_000);
    expect(engine.previousEventMs(100)).toBeNull();
    expect(engine.axisOf(T0 + 300_000)).toBe(300_000);
  });

  it('stays in places are bands of the axis, and the place at a moment is in the frame', () => {
    const engine = makeReplayEngine(replay(), 'real');
    expect(engine.bands).toEqual([{ placeId: 'park', from: 250 / 1200, to: 450 / 1200 }]);
    expect(engine.frameAt(300_000).places).toEqual(['Парк']);
    expect(engine.frameAt(100_000).places).toEqual([]);
    const moving = makeReplayEngine(replay(), 'moving');
    expect(moving.bands[0]?.to).toBeGreaterThan(moving.bands[0]?.from ?? 1);
  });

  it('a replay with no profile still plays (speed unknown)', () => {
    const engine = makeReplayEngine({ ...replay(), profile: null }, 'real');
    expect(engine.frameAt(100_000).speedMps).toBeNull();
  });
});
