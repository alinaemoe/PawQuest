import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AUTO_FINISH_STAY_S,
  autoFinishAtBase,
  walkBaseArrival,
  walkStartSpotArrival,
  walkChronology,
  walkCutSuggestion,
} from './chronology';
import { createDog, type Dog } from './dogs';
import { createPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { splitWalkAroundStay } from './walkStructure';
import { START, testEnv, type TestEnv } from './test-utils';
import { createManualWalk } from './walks';

const SHOP = { lat: 55.7558, lon: 37.6173 };
const STEP = 0.00001; // about 1.1 m north per second

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

/** Walks 150 s, stands at `stopAt` for `stopS`, walks 150 s more; returns the walk id. */
function recordWalk(stopAt: { lat: number; lon: number }, stopS: number): string {
  const points: TrackPointInput[] = [];
  let t = START;
  for (let i = 0; i < 150; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat - (150 - i) * STEP,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 1.2,
    });
  }
  for (let i = 0; i < stopS; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat + (i % 2) * 0.000004,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 0,
    });
  }
  for (let i = 1; i <= 150; i++, t += 1000) {
    points.push({
      ts: t,
      lat: stopAt.lat + i * STEP,
      lon: stopAt.lon,
      accuracyM: 5,
      speedMps: 1.2,
    });
  }
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, t);
  return walk.id;
}

describe('walkChronology', () => {
  it('recognises a saved place in the visit and names the walk after it', () => {
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    const id = recordWalk(SHOP, 420);
    const result = walkChronology(env.db, id, START + 3_600_000);
    expect(result?.steps.map((s) => s.kind)).toEqual(['leg', 'visit', 'leg']);
    expect(result?.title).toBe('Магазин');
    const visit = result?.steps.find((s) => s.kind === 'visit');
    expect(visit?.kind === 'visit' ? visit.placeId : null).not.toBeNull();
  });

  it('the same walk without that place has an unnamed visit and no title', () => {
    const id = recordWalk(SHOP, 420);
    const result = walkChronology(env.db, id, START + 3_600_000);
    expect(result?.title).toBeNull();
    expect(result?.steps.filter((s) => s.kind === 'visit')).toHaveLength(1);
  });

  it('a place named later changes the result for the old walk', () => {
    const id = recordWalk(SHOP, 420);
    expect(walkChronology(env.db, id, START + 3_600_000)?.title).toBeNull();
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    expect(walkChronology(env.db, id, START + 3_600_000)?.title).toBe('Магазин');
  });

  it('a walk without a track, a missing walk and a one-point track have no chronology', () => {
    const manual = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    expect(walkChronology(env.db, manual.id, START)).toBeNull();
    expect(walkChronology(env.db, 'nope', START)).toBeNull();
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, [{ ts: START, ...SHOP, accuracyM: 5, speedMps: 0 }]);
    expect(walkChronology(env.db, walk.id, START)).toBeNull();
  });
});

describe('the title of a walk from a base to a base', () => {
  it('names where the walk began and ended, not only the visits', () => {
    // 150 s north, 400 s at the spot, 150 s further: begins 165 m south of the spot
    const home = { lat: SHOP.lat - 150 * STEP, lon: SHOP.lon };
    createPlace(env.db, env.ctx, {
      name: 'Дом',
      category: 'home',
      label: 'Дом',
      ...home,
      radiusM: 60,
    });
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    const id = recordWalk(SHOP, 420);
    expect(walkChronology(env.db, id, START + 3_600_000)?.title).toBe('Дом → Магазин');
  });
});

describe('walkBaseArrival', () => {
  /** A running walk: 150 s of walking, then `stopS` seconds standing at the spot. */
  function runningWalk(stopS: number): string {
    const points: TrackPointInput[] = [];
    let t = START;
    for (let i = 0; i < 150; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat - (150 - i) * STEP,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 1.2,
      });
    }
    for (let i = 0; i < stopS; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat + (i % 2) * 0.000004,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 0,
      });
    }
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    return walk.id;
  }

  it('asks at a guests place after fifteen minutes, with its name and arrival time', () => {
    createPlace(env.db, env.ctx, { name: 'Мама', category: 'guests', label: 'Гости', ...SHOP });
    const id = runningWalk(1200);
    const found = walkBaseArrival(env.db, id, START + 150_000 + 1_200_000);
    expect(found?.placeName).toBe('Мама');
    expect(found?.stayS).toBeGreaterThan(1100);
    expect(found?.arrivedAt).toBeGreaterThanOrEqual(START + 100_000);
    expect(found?.arrivedAt).toBeLessThanOrEqual(START + 200_000);
  });

  it('does not ask at a shop, or when the place has no name yet, or before fifteen minutes', () => {
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...SHOP });
    expect(walkBaseArrival(env.db, runningWalk(1200), START + 2_000_000)).toBeNull();
  });

  it('a walk without points has nothing to ask', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(walkBaseArrival(env.db, walk.id, START)).toBeNull();
  });
});

describe('walkCutSuggestion (S-11)', () => {
  /** Walks 150 s, stands `stopS` seconds at the spot, then walks `afterS` seconds on. */
  function finishedWalk(stopS: number, afterS: number): { id: string; end: number } {
    const points: TrackPointInput[] = [];
    let t = START;
    for (let i = 0; i < 150; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat - (150 - i) * STEP,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 1.2,
      });
    }
    for (let i = 0; i < stopS; i++, t += 1000) {
      points.push({
        ts: t,
        lat: SHOP.lat + (i % 2) * 0.000004,
        lon: SHOP.lon,
        accuracyM: 5,
        speedMps: 0,
      });
    }
    for (let i = 1; i <= afterS; i++, t += 1000) {
      points.push({ ts: t, lat: SHOP.lat + i * STEP, lon: SHOP.lon, accuracyM: 5, speedMps: 1.2 });
    }
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    finishWalk(env.db, env.ctx, walk.id, t);
    return { id: walk.id, end: t };
  }
  const guests = () =>
    createPlace(env.db, env.ctx, { name: 'Мама', category: 'guests', label: 'Гости', ...SHOP });

  it('a walk that ended in the base after a long stay is cut at the arrival', () => {
    guests();
    const { id, end } = finishedWalk(1800, 0);
    const found = walkCutSuggestion(env.db, id, end);
    expect(found?.kind).toBe('trim');
    expect(found?.placeName).toBe('Мама');
    expect(found?.kind === 'trim' ? found.at : 0).toBeGreaterThan(START + 100_000);
    expect(found?.kind === 'trim' ? found.at : 0).toBeLessThan(START + 200_000);
  });

  it('a walk that went on after the stay is split around it', () => {
    guests();
    const { id, end } = finishedWalk(1800, 600);
    const found = walkCutSuggestion(env.db, id, end);
    expect(found?.kind).toBe('split');
    if (found?.kind === 'split') {
      expect(found.leftAt).toBeGreaterThan(found.arrivedAt + 1_500_000);
      const { first, second } = splitWalkAroundStay(
        env.db,
        env.ctx,
        id,
        found.arrivedAt,
        found.leftAt,
      );
      expect(first.endedAt).toBe(found.arrivedAt);
      expect(second.startedAt).toBe(found.leftAt);
      expect(walkCutSuggestion(env.db, first.id, end)).toBeNull();
    }
  });

  it('a few minutes of walking after the stay are not a walk of their own', () => {
    guests();
    const { id, end } = finishedWalk(1800, 120);
    expect(walkCutSuggestion(env.db, id, end)?.kind).toBe('trim');
  });

  it('a short visit, a shop and a walk that has no base give nothing', () => {
    guests();
    expect(walkCutSuggestion(env.db, finishedWalk(480, 300).id, START + 3_600_000)).toBeNull();
  });

  it('nothing for a missing walk or one still running', () => {
    expect(walkCutSuggestion(env.db, 'nope', START)).toBeNull();
    const running = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(walkCutSuggestion(env.db, running.id, START)).toBeNull();
  });
});

describe('autoFinishAtBase', () => {
  const HOME = { lat: 55.7, lon: 37.6 };

  /** A running walk: 150 s walking home from afar, then `stayS` seconds around the flat (GPS wanders a little). */
  function homecoming(stayS: number): string {
    const points: TrackPointInput[] = [];
    let t = START;
    for (let i = 0; i < 150; i++, t += 1000) {
      points.push({
        ts: t,
        lat: HOME.lat - (150 - i) * STEP,
        lon: HOME.lon,
        accuracyM: 5,
        speedMps: 1.2,
      });
    }
    for (let i = 0; i < stayS; i++, t += 1000) {
      points.push({
        ts: t,
        lat: HOME.lat + Math.sin(i / 7) * 0.000012,
        lon: HOME.lon + Math.cos(i / 5) * 0.000012,
        accuracyM: 8,
        speedMps: i % 3 === 0 ? 0.4 : 0.1,
      });
    }
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    return walk.id;
  }
  const home = () =>
    createPlace(env.db, env.ctx, { name: 'Дом', category: 'home', label: 'Дом', ...HOME });

  it('comes home, walks around the flat for five minutes: the walk ends at the moment of arrival', () => {
    home();
    const id = homecoming(AUTO_FINISH_STAY_S + 60);
    const done = autoFinishAtBase(
      env.db,
      env.ctx,
      id,
      START + 150_000 + (AUTO_FINISH_STAY_S + 60) * 1000,
    );
    expect(done?.placeName).toBe('Дом');
    expect(done?.walk.status).toBe('completed');
    expect(done?.walk.endedAt).toBe(done?.arrivedAt);
    expect(done?.arrivedAt).toBeGreaterThanOrEqual(START + 100_000);
    expect(done?.arrivedAt).toBeLessThanOrEqual(START + 200_000);
    expect(done?.walk.durationS).toBeLessThan(220);
  });

  it('a shorter stay, a place that is not a base, or no home at all: nothing happens', () => {
    home();
    const short = homecoming(120);
    expect(autoFinishAtBase(env.db, env.ctx, short, START + 150_000 + 120_000)).toBeNull();
  });

  it('a shop is not home', () => {
    createPlace(env.db, env.ctx, { name: 'Магазин', category: 'shop', label: 'Магазин', ...HOME });
    const id = homecoming(AUTO_FINISH_STAY_S + 60);
    expect(autoFinishAtBase(env.db, env.ctx, id, START + 600_000)).toBeNull();
  });

  it('standing at the door before setting off is not coming home; a finished or unknown walk is left alone', () => {
    home();
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    const points: TrackPointInput[] = Array.from({ length: 400 }, (_, i) => ({
      ts: START + i * 1000,
      lat: HOME.lat,
      lon: HOME.lon,
      accuracyM: 5,
      speedMps: 0,
    }));
    appendTrackPoints(env.db, walk.id, points);
    expect(autoFinishAtBase(env.db, env.ctx, walk.id, START + 400_000)).toBeNull();
    expect(autoFinishAtBase(env.db, env.ctx, 'nope', START)).toBeNull();
    const manual = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    expect(autoFinishAtBase(env.db, env.ctx, manual.id, START)).toBeNull();
  });
});

describe('walkStartSpotArrival', () => {
  /** A running walk: 100 s at the door, 600 s walking away (900 m), 600 s back, then `stayS` standing. */
  function loop(stayS: number, farM = 900): string {
    const points: TrackPointInput[] = [];
    const HOME = { lat: 55.8, lon: 37.5 };
    let t = START;
    const fix = (northM: number, speed: number) => {
      points.push({
        ts: t,
        lat: HOME.lat + northM / 111_195 + (speed === 0 ? (t % 3000) * 1e-9 : 0),
        lon: HOME.lon,
        accuracyM: 5,
        speedMps: speed,
      });
      t += 1000;
    };
    for (let i = 0; i < 100; i++) fix(0, 0);
    for (let i = 0; i < 600; i++) fix((farM * i) / 600, 1.5);
    for (let i = 0; i < 600; i++) fix(farM - (farM * i) / 600, 1.5);
    for (let i = 0; i < stayS; i++) fix(0, 0);
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    return walk.id;
  }

  it('asks after ten minutes back at the start, with no home marked, giving the spot', () => {
    const id = loop(700);
    const found = walkStartSpotArrival(env.db, id, START + 2_000_000);
    expect(found?.placeName).toBe('');
    expect(found?.stayS).toBeGreaterThan(600);
    expect(found?.lat).toBeCloseTo(55.8, 3);
    expect(walkBaseArrival(env.db, id, START + 2_000_000)).toBeNull();
  });

  it('a short stay is not asked about', () => {
    expect(walkStartSpotArrival(env.db, loop(300), START + 1_700_000)).toBeNull();
  });

  it('a short way out is not asked about', () => {
    expect(walkStartSpotArrival(env.db, loop(700, 80), START + 2_000_000)).toBeNull();
  });

  it('a walk with nothing recorded has nothing to ask', () => {
    const empty = startWalk(env.db, env.ctx, { dogId: dog.id });
    expect(walkStartSpotArrival(env.db, empty.id, START)).toBeNull();
  });
});
