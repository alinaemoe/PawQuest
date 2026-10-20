import { speedProfile } from '@pawquest/core';
import type { WalkReplay } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { compareAxis, compareRows, compareSide, leadText, liveRows } from './replayCompare';
import type { ReplayFrame } from './replayEngine';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);
const M = 1 / 111_195;

/** A straight walk north at `mps` for `seconds`, one fix a second. */
function replay(seconds: number, mps: number, events = 0): WalkReplay {
  const points = Array.from({ length: seconds + 1 }, (_, i) => ({
    ts: T0 + i * 1000,
    lat: 55 + i * mps * M,
    lon: 37,
    speedMps: mps,
  }));
  return {
    walkId: 'w',
    startTs: T0,
    endTs: T0 + seconds * 1000,
    points,
    cumulativeM: points.map((_, i) => i * mps),
    line: [],
    paused: [],
    events: Array.from({ length: events }, (_, i) => ({
      id: `e${String(i)}`,
      typeId: 'dog',
      ts: T0 + (i + 1) * 1000,
    })) as unknown as WalkReplay['events'],
    photos: [],
    passes: [],
    zones: [],
    profile: speedProfile(points),
  };
}

describe('compareAxis', () => {
  it('by progress the first walk leads and the second is stretched to the same share', () => {
    const axis = compareAxis(600_000, 1_200_000, 'progress');
    expect(axis.lengthMs).toBe(600_000);
    expect(axis.axisA(300_000)).toBe(300_000);
    expect(axis.axisB(300_000)).toBe(600_000);
    expect(axis.axisB(600_000)).toBe(1_200_000);
  });

  it('by time the longer walk leads and the shorter one stops at its end', () => {
    const axis = compareAxis(600_000, 1_200_000, 'time');
    expect(axis.lengthMs).toBe(1_200_000);
    expect(axis.axisA(900_000)).toBe(600_000);
    expect(axis.axisB(900_000)).toBe(900_000);
    expect(axis.axisA(-5)).toBe(0);
  });
});

describe('compareRows', () => {
  it('duration, distance, pace and events of both, and no pace for a tiny walk', () => {
    const a = compareSide(replay(600, 1.5, 2));
    const b = compareSide(replay(1200, 1));
    const rows = compareRows(a, b, ru);
    expect(rows.map((r) => r.key)).toEqual(['duration', 'distance', 'pace', 'events']);
    expect(rows[0]).toMatchObject({ a: '10 мин', b: '20 мин' });
    expect(rows[1]).toMatchObject({ a: '900 м', b: '1,2 км' });
    expect(rows[3]).toMatchObject({ a: '2', b: '0' });
    const tiny = compareRows(compareSide(replay(60, 1)), b, ru);
    expect(tiny[2]?.a).not.toBe(rows[2]?.a);
  });
});

describe('leadText', () => {
  const frame = (distanceM: number): ReplayFrame =>
    ({ distanceM, places: [], pass: null, wallTs: 0 }) as unknown as ReplayFrame;
  it('who has covered more, or level within a few meters', () => {
    expect(leadText(frame(500), frame(380), ru)).toBe('Первая впереди на 120 м');
    expect(leadText(frame(380), frame(500), ru)).toBe('Вторая впереди на 120 м');
    expect(leadText(frame(500), frame(490), ru)).toBe('Идут вровень');
  });
});

describe('liveRows', () => {
  it('the way covered and the pace of each at the moment', () => {
    const a = compareSide(replay(600, 1.5));
    const b = compareSide(replay(1200, 1));
    const rows = liveRows(a.engine.frameAt(300_000), b.engine.frameAt(300_000), ru);
    expect(rows.map((r) => r.key)).toEqual(['covered', 'now']);
    expect(rows[0]).toMatchObject({ a: '450 м', b: '300 м' });
    expect(rows[1]?.a).not.toBe('');
  });
});
