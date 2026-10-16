import { speedProfile } from '@pawquest/core';
import type { WalkReplay } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { makeReplayEngine } from './replayEngine';
import { replayReadout, speedSummary, speedText } from './replayModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const T0 = Date.UTC(2026, 9, 16, 8, 0, 0);
const M = 6.5 / 111_195;

/** 10 minutes: the first half at 1.0 m/s, the second at 2.0 m/s. */
function replay(): WalkReplay {
  let lat = 55;
  const points = Array.from({ length: 121 }, (_, i) => {
    const speed = i < 60 ? 1 : 2;
    lat += (speed * 5 * M) / 6.5;
    return { ts: T0 + i * 5000, lat, lon: 37, speedMps: speed };
  });
  return {
    walkId: 'w',
    startTs: T0,
    endTs: T0 + 600_000,
    points,
    cumulativeM: points.map((_, i) => i * 7.5),
    line: [],
    paused: [],
    events: [{ id: 'e', typeId: 'dog', ts: T0 + 120_000, reaction: 3 }],
    photos: [],
    passes: [
      {
        routeId: 'r',
        routeName: 'Прямая',
        fromTs: T0,
        toTs: T0 + 100_000,
        direction: 'backward',
      },
    ],
    profile: speedProfile(points),
  };
}

function need<T>(value: T | null): T {
  if (value === null) {
    throw new Error('missing');
  }
  return value;
}

describe('speedText', () => {
  it('speed with its zone, "standing" where it is not known or too slow to have a pace', () => {
    expect(speedText(1.2, 'walk', ru)).toBe('4,3 км/ч · шаг');
    expect(speedText(null, 'standing', ru)).toBe('стоим');
    expect(speedText(0.1, 'standing', ru)).toBe('стоим');
  });
});

describe('replayReadout', () => {
  it('time of the axis and its length, distance, speed, events so far and the route', () => {
    const data = replay();
    const engine = makeReplayEngine(data, 'real');
    const early = replayReadout(engine.frameAt(60_000), 60_000, engine.lengthMs, 1, ru);
    expect(early.clock).toBe('00:01:00 / 00:10:00');
    expect(early.speed).toContain('шаг');
    expect(early.events).toBe('Событий: 0 из 1');
    expect(early.pass).toBe('Маршрут «Прямая», обратно');
    const late = replayReadout(engine.frameAt(300_000), 300_000, engine.lengthMs, 1, ru);
    expect(late.events).toBe('Событий: 1 из 1');
    expect(late.pass).toBeNull();
    expect(late.distance).toBe(ru.formatDistance((300 / 5) * 7.5));
  });
});

describe('speedSummary', () => {
  it('time in the zones with shares, the pattern of the pace and the profile for the chart', () => {
    const data = replay();
    const summary = speedSummary(need(data.profile), data.startTs, data.endTs, ru);
    expect(summary.zones.map((z) => z.label)).toEqual(['шаг', 'быстрый шаг или трусца']);
    expect(summary.zones[0]?.value).toBe('5 мин · 50%');
    expect(summary.pattern).toBe('К концу быстрее');
    expect(summary.fastStart).toBeNull();
    expect(summary.profile).toHaveLength(20);
    expect(Math.max(...summary.profile.map((w) => w.level))).toBe(1);
    expect(summary.profile[0]?.at).toBeGreaterThan(0);
  });

  it('a zone shorter than ten seconds is not shown; a fast start is named', () => {
    const points = Array.from({ length: 61 }, (_, i) => ({
      ts: T0 + i * 5000,
      lat: 55 + i * 1e-5,
      lon: 37,
      speedMps: i < 12 ? 2.2 : 1,
    }));
    const profile = speedProfile(points);
    if (profile === null) {
      throw new Error('no profile');
    }
    const summary = speedSummary(profile, T0, T0 + 300_000, ru);
    expect(summary.fastStart).toBe('быстрый старт');
    expect(summary.zones.some((z) => z.zone === 'run')).toBe(false);
  });
});
