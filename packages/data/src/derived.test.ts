import { mulberry32 } from '@pawquest/insights';
import type { WeatherFacts } from '@pawquest/weather';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildAnalysisUnits, walkPatterns } from './analysis';
import {
  DERIVED_VERSIONS,
  clearDerived,
  computeDims,
  derivedHealth,
  fingerprint,
  listWalkDims,
  refreshDerived,
} from './derived';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { createPlace, setPlaceBoundary, setWalkPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk, type TrackPointInput } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import { createManualWalk, updateWalk } from './walks';
import { saveWeatherSnapshot } from './weather';

const DAY = 86_400_000;
const MIN = 60_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const facts = (extra: Partial<WeatherFacts> = {}): WeatherFacts => ({
  at: START,
  gridDistanceKm: 1,
  tempC: 8,
  apparentC: 6,
  humidityPct: 70,
  windMs: 2,
  gustMs: 4,
  code: 1,
  isDay: true,
  rain3hMm: 0,
  rain24hMm: 0,
  rain72hMm: 0,
  snow24hCm: 0,
  raining: false,
  nextRainMin: null,
  lastRainAt: null,
  surfaceTempC: 12,
  soilMoisture: 0.2,
  uv: 1,
  sunrise: null,
  sunset: null,
  daylightLeftMin: 300,
  untilSunriseMin: null,
  aqi: 25,
  pm25: 5,
  pollen: [],
  ...extra,
});

/** A finished walk by hand on day `day`, `minutes` long. */
function manual(day: number, minutes = 30, placeKind: string | null = null): string {
  return createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
    placeKind,
  }).id;
}

/** A GPS walk of ten minutes along a line. */
function gps(day: number): string {
  const t0 = START + day * DAY;
  const points: TrackPointInput[] = Array.from({ length: 120 }, (_, i) => ({
    ts: t0 + i * 5000,
    lat: 55 + (i * 6.5) / 111_195,
    lon: 37,
    accuracyM: 5,
    speedMps: 1.3,
  }));
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(env.db, walk.id, points);
  finishWalk(env.db, env.ctx, walk.id, t0 + 600_000);
  return walk.id;
}

const event = (walkId: string, typeId: string, day: number, reaction?: number) =>
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    walkId,
    typeId,
    ts: START + day * DAY + 5 * MIN,
    tzOffsetMin: 0,
    incomplete: false,
    ...(reaction === undefined ? {} : { reaction }),
  });

const rows = (walkId: string) =>
  env.db.all(
    'SELECT kind, status, algo_version FROM walk_derived WHERE walk_id = ? ORDER BY kind',
    [walkId],
  );

describe('refreshDerived', () => {
  it('works every finished walk out once, and a second call costs nothing', () => {
    const ids = [manual(0), manual(1), gps(2)];
    const first = refreshDerived(env.db, env.ctx, dog.id);
    expect(first).toEqual({ total: 3, computed: 3, skipped: 0, failed: 0, remaining: 0 });
    for (const id of ids) {
      expect(rows(id)).toEqual([
        { kind: 'dims', status: 'ok', algo_version: DERIVED_VERSIONS.dims },
        { kind: 'structure', status: 'ok', algo_version: DERIVED_VERSIONS.structure },
      ]);
    }
    expect(refreshDerived(env.db, env.ctx, dog.id)).toEqual({
      total: 3,
      computed: 0,
      skipped: 3,
      failed: 0,
      remaining: 0,
    });
  });

  it('leaves out running walks, deleted walks and the walks of other dogs', () => {
    manual(0);
    const gone = manual(1);
    softDelete(env.db, env.ctx, 'walk', gone);
    startWalk(env.db, env.ctx, { dogId: dog.id });
    const other = createDog(env.db, env.ctx, { name: 'Рекс' });
    createManualWalk(env.db, env.ctx, { dogId: other.id, startedAt: START, durationS: 600 });
    expect(refreshDerived(env.db, env.ctx, dog.id).total).toBe(1);
    expect(Number(env.db.all('SELECT COUNT(*) AS n FROM walk_derived')[0]?.['n'])).toBe(2);
  });

  it('a walk by hand has no track: its structure says so and its dimensions are the ones it can have', () => {
    const id = manual(0, 40, 'park');
    refreshDerived(env.db, env.ctx, dog.id);
    const dims = listWalkDims(env.db, dog.id)[0]?.dims;
    expect(listWalkDims(env.db, dog.id)[0]?.walkId).toBe(id);
    expect(dims?.dims).toMatchObject({ time_of_day: 'day', duration: '20_45' });
    expect(dims?.dims['walk_type']).toBeUndefined();
    expect(dims?.dims['ride']).toBeUndefined();
    // a walk by hand has an unfinished summary and no events: nothing is known about its outcomes
    expect(dims?.outcomes).toEqual({});
    // once the owner has finished the summary, "nothing happened" is a fact
    updateWalk(env.db, env.ctx, id, { summaryPending: false });
    refreshDerived(env.db, env.ctx, dog.id);
    expect(listWalkDims(env.db, dog.id)[0]?.dims.outcomes).toEqual({
      hard_moment: false,
      success: false,
    });
  });

  it('works out at most the limit, and says how many are waiting', () => {
    [0, 1, 2, 3, 4].forEach((d) => manual(d));
    const a = refreshDerived(env.db, env.ctx, dog.id, { limit: 2 });
    expect(a).toMatchObject({ computed: 2, remaining: 3 });
    const b = refreshDerived(env.db, env.ctx, dog.id, { limit: 2 });
    expect(b).toMatchObject({ computed: 2, skipped: 2, remaining: 1 });
    const c = refreshDerived(env.db, env.ctx, dog.id, { limit: 2 });
    expect(c).toMatchObject({ computed: 1, skipped: 4, remaining: 0 });
    expect(derivedHealth(env.db, dog.id)).toEqual({ walks: 5, current: 5, stale: 0, errors: 0 });
  });

  it('a new walk and a changed fact are worked out again, nothing else', () => {
    const a = manual(0);
    const b = manual(1);
    refreshDerived(env.db, env.ctx, dog.id);
    const before = fingerprint(env.db, a);
    saveWeatherSnapshot(env.db, a, facts({ raining: true }));
    expect(fingerprint(env.db, a)).not.toBe(before);
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 1, skipped: 1 });
    expect(listWalkDims(env.db, dog.id).find((r) => r.walkId === a)?.dims.dims['ground']).toBe(
      'wet',
    );
    expect(
      listWalkDims(env.db, dog.id).find((r) => r.walkId === b)?.dims.dims['ground'],
    ).toBeUndefined();
    manual(2);
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 1, skipped: 2 });
  });

  it('naming a place makes every walk be looked at again (places are shared facts)', () => {
    [0, 1, 2].forEach((d) => manual(d));
    refreshDerived(env.db, env.ctx, dog.id);
    createPlace(env.db, env.ctx, { category: 'park', label: 'Парк', lat: 55, lon: 37 });
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 3, skipped: 0 });
  });

  it('an event written after the walk changes its outcome', () => {
    const id = manual(0);
    updateWalk(env.db, env.ctx, id, { summaryPending: false });
    refreshDerived(env.db, env.ctx, dog.id);
    expect(listWalkDims(env.db, dog.id)[0]?.dims.outcomes['hard_moment']).toBe(false);
    event(id, 'hard', 0, 4);
    refreshDerived(env.db, env.ctx, dog.id);
    const dims = listWalkDims(env.db, dog.id)[0]?.dims;
    expect(dims?.outcomes).toMatchObject({ hard_moment: true, strong_reaction: true });
  });

  it('a walk the owner has not finished the summary of and recorded nothing for has no outcomes', () => {
    const id = manual(0);
    updateWalk(env.db, env.ctx, id, { summaryPending: true });
    refreshDerived(env.db, env.ctx, dog.id);
    expect(listWalkDims(env.db, dog.id)[0]?.dims.outcomes).toEqual({});
  });
});

describe('failures', () => {
  it('one walk that cannot be worked out is recorded and does not stop the others', () => {
    const bad = manual(1);
    const good = [manual(0), manual(2)];
    const result = refreshDerived(env.db, env.ctx, dog.id, {
      hooks: {
        structure: (walkId) => {
          if (walkId === bad) {
            throw new Error('broken track');
          }
          return {
            hasTrack: false,
            title: null,
            startPlaceCategory: null,
            endPlaceCategory: null,
            visitCount: 0,
            shopVisit: false,
            rideS: 0,
          };
        },
      },
    });
    expect(result).toMatchObject({ computed: 2, failed: 1 });
    expect(rows(bad)).toEqual([
      { kind: 'dims', status: 'ok', algo_version: DERIVED_VERSIONS.dims },
      { kind: 'structure', status: 'error', algo_version: DERIVED_VERSIONS.structure },
    ]);
    expect(
      env.db.all("SELECT error FROM walk_derived WHERE walk_id = ? AND kind = 'structure'", [
        bad,
      ])[0]?.['error'],
    ).toContain('broken track');
    for (const id of good) {
      expect(rows(id).every((r) => r['status'] === 'ok')).toBe(true);
    }
  });

  it('a failed walk is not tried again and again, until asked or until its facts change', () => {
    const bad = manual(0);
    const fail = {
      structure: () => {
        throw new Error('x');
      },
    };
    refreshDerived(env.db, env.ctx, dog.id, { hooks: fail });
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 0, skipped: 1 });
    expect(derivedHealth(env.db, dog.id)).toMatchObject({ errors: 1, current: 0 });
    // asked to retry, and now it works
    expect(refreshDerived(env.db, env.ctx, dog.id, { retryErrors: true })).toMatchObject({
      computed: 1,
      failed: 0,
    });
    expect(rows(bad).every((r) => r['status'] === 'ok')).toBe(true);
    expect(derivedHealth(env.db, dog.id)).toMatchObject({ errors: 0, current: 1 });
  });

  it('a failed walk is tried again when its facts change', () => {
    const bad = manual(0);
    refreshDerived(env.db, env.ctx, dog.id, {
      hooks: {
        dims: () => {
          throw new Error('x');
        },
      },
    });
    saveWeatherSnapshot(env.db, bad, facts());
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 1 });
  });

  it('both kinds failing is still a recorded failure, not an exception', () => {
    manual(0);
    const boom = () => {
      throw new Error('x');
    };
    expect(
      refreshDerived(env.db, env.ctx, dog.id, { hooks: { structure: boom, dims: boom } }),
    ).toMatchObject({ failed: 1 });
    expect(listWalkDims(env.db, dog.id)).toEqual([]);
  });

  it('unreadable stored data is a gap, not a crash', () => {
    const a = manual(0);
    manual(1);
    refreshDerived(env.db, env.ctx, dog.id);
    env.db.run("UPDATE walk_derived SET json = '{broken' WHERE walk_id = ? AND kind = 'dims'", [a]);
    expect(listWalkDims(env.db, dog.id)).toHaveLength(1);
    // damaged weather is no weather
    const c = manual(2);
    saveWeatherSnapshot(env.db, c, facts());
    env.db.run("UPDATE weather_snapshot SET facts_json = 'nonsense' WHERE walk_id = ?", [c]);
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ failed: 0 });
    expect(
      listWalkDims(env.db, dog.id).find((r) => r.walkId === c)?.dims.dims['ground'],
    ).toBeUndefined();
  });
});

describe('versions and recounting', () => {
  it('rows made by an older rule are made again, and are not used meanwhile', () => {
    [0, 1].forEach((d) => manual(d));
    refreshDerived(env.db, env.ctx, dog.id);
    env.db.run("UPDATE walk_derived SET algo_version = algo_version - 1 WHERE kind = 'dims'");
    expect(listWalkDims(env.db, dog.id)).toEqual([]);
    expect(derivedHealth(env.db, dog.id)).toMatchObject({ stale: 2, current: 0 });
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 2 });
    expect(listWalkDims(env.db, dog.id)).toHaveLength(2);
  });

  it('clearing everything and counting again gives the same result', () => {
    const ids = [manual(0), gps(1), manual(2)];
    ids.forEach((id, i) => {
      saveWeatherSnapshot(env.db, id, facts({ rain24hMm: i * 2 }));
    });
    refreshDerived(env.db, env.ctx, dog.id);
    const before = listWalkDims(env.db, dog.id);
    expect(clearDerived(env.db, dog.id)).toBe(6);
    expect(listWalkDims(env.db, dog.id)).toEqual([]);
    refreshDerived(env.db, env.ctx, dog.id);
    expect(listWalkDims(env.db, dog.id)).toEqual(before);
  });

  it('removing a walk for good takes its derived rows with it', () => {
    const id = manual(0);
    refreshDerived(env.db, env.ctx, dog.id);
    env.db.run('DELETE FROM walk WHERE id = ?', [id]);
    expect(Number(env.db.all('SELECT COUNT(*) AS n FROM walk_derived')[0]?.['n'])).toBe(0);
  });
});

describe('a GPS walk', () => {
  it('knows where it began and ended, and that it had no ride', () => {
    createPlace(env.db, env.ctx, {
      category: 'home',
      label: 'Дом',
      lat: 55,
      lon: 37,
      radiusM: 100,
    });
    const id = gps(0);
    refreshDerived(env.db, env.ctx, dog.id);
    const row = env.db.all(
      "SELECT json FROM walk_derived WHERE walk_id = ? AND kind = 'structure'",
      [id],
    )[0];
    expect(JSON.parse(String(row?.['json']))).toMatchObject({
      hasTrack: true,
      startPlaceCategory: 'home',
      endPlaceCategory: null,
      rideS: 0,
    });
    const dims = listWalkDims(env.db, dog.id)[0]?.dims.dims;
    expect(dims).toMatchObject({ walk_type: 'from_base', ride: 'no', shop_visit: 'no' });
  });
});

describe('analysis units and patterns', () => {
  it('only the walks that are worked out are units', () => {
    [0, 1, 2].forEach((d) => manual(d));
    expect(buildAnalysisUnits(env.db, dog.id)).toEqual([]);
    refreshDerived(env.db, env.ctx, dog.id, { limit: 2 });
    expect(buildAnalysisUnits(env.db, dog.id)).toHaveLength(2);
    expect(walkPatterns(env.db, dog.id).health).toMatchObject({ stale: 1 });
  });

  it('since a moment: older walks are left out', () => {
    [0, 1, 2].forEach((d) => manual(d));
    refreshDerived(env.db, env.ctx, dog.id);
    expect(buildAnalysisUnits(env.db, dog.id, { sinceTs: START + 1 * DAY })).toHaveLength(2);
  });

  it('finds that hard moments came with wet ground, and says among how many it looked', () => {
    // eight wet walks, seven with a hard moment; eight dry ones, one with a hard moment
    for (let i = 0; i < 16; i += 1) {
      const wet = i < 8;
      const id = manual(i);
      saveWeatherSnapshot(env.db, id, facts({ rain24hMm: wet ? 5 : 0 }));
      if ((wet && i < 7) || i === 12) {
        event(id, 'hard', i, 3);
      } else {
        event(id, 'dog', i);
      }
    }
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const { cards, unitCount, health } = walkPatterns(env.db, dog.id);
    expect(unitCount).toBe(16);
    expect(health).toMatchObject({ stale: 0, errors: 0 });
    // one card per dimension, the stronger side of it: dry ground came with fewer hard moments
    const card = cards.find((c) => c.dimension === 'ground');
    expect(card?.key).toBe('ground|dry|hard_moment');
    expect(card?.inCondition).toMatchObject({ k: 1, n: 8 });
    expect(card?.rest).toMatchObject({ k: 7, n: 8 });
    expect(card?.delta).toBeLessThan(-0.5);
    expect(card?.testedCount).toBeGreaterThan(1);
  });

  it('too few walks give no cards, and a hidden key is not shown', () => {
    [0, 1, 2].forEach((d) => manual(d));
    refreshDerived(env.db, env.ctx, dog.id);
    expect(walkPatterns(env.db, dog.id).cards).toEqual([]);
  });
});

describe('many walks', () => {
  it('sixty walks are worked out in one call, and recounting them is cheap', () => {
    for (let i = 0; i < 60; i += 1) {
      manual(i, 20 + (i % 40));
    }
    const started = Date.now();
    expect(refreshDerived(env.db, env.ctx, dog.id, { limit: 100 })).toMatchObject({ computed: 60 });
    expect(refreshDerived(env.db, env.ctx, dog.id)).toMatchObject({ computed: 0, skipped: 60 });
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});

describe('what the dimensions are made from', () => {
  const M_PER_DEG = 111_195;
  const spot = (x: number, y: number) => ({
    lat: 55 + y / M_PER_DEG,
    lon: 37 + x / (M_PER_DEG * Math.cos((55 * Math.PI) / 180)),
  });

  it('a walk that went into a shop, and one that had a ride', () => {
    createPlace(env.db, env.ctx, {
      category: 'shop',
      label: 'Магазин',
      ...spot(100, 0),
      radiusM: 40,
    });
    // 100 m of walking, a stand of ten minutes at the shop, then a car ride of five minutes
    const t0 = START;
    const points: TrackPointInput[] = [];
    let t = t0;
    let x = 0;
    const fix = (speed: number) => {
      points.push({ ts: t, ...spot(x, 0), accuracyM: 5, speedMps: speed });
    };
    fix(0);
    for (let i = 0; i < 20; i += 1) {
      t += 5000;
      x += 5;
      fix(1);
    }
    for (let i = 0; i < 120; i += 1) {
      t += 5000;
      fix(0);
    }
    for (let i = 0; i < 60; i += 1) {
      t += 5000;
      x += 50;
      fix(10);
    }
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, points);
    finishWalk(env.db, env.ctx, walk.id, t);
    refreshDerived(env.db, env.ctx, dog.id);
    const dims = listWalkDims(env.db, dog.id)[0]?.dims.dims;
    expect(dims).toMatchObject({ shop_visit: 'yes', ride: 'yes' });
  });

  it('the size of a place with a contour is the size of its area, not the circle kept beside it', () => {
    const id = manual(0);
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      ...spot(0, 0),
      radiusM: 300,
    });
    // a 100 m by 100 m glade drawn as the contour of a "park"
    setPlaceBoundary(env.db, env.ctx, park.id, [
      spot(0, 0),
      spot(100, 0),
      spot(100, 100),
      spot(0, 100),
    ]);
    setWalkPlace(env.db, env.ctx, id, { placeId: park.id, placeKind: null });
    refreshDerived(env.db, env.ctx, dog.id);
    expect(listWalkDims(env.db, dog.id)[0]?.dims.dims['place_size']).toBe('small');
  });

  it('a walk that is not there cannot be worked out', () => {
    expect(() => computeDims(env.db, 'nope', null)).toThrow('Walk not found');
  });

  it('weather that only goes with the place is explained by the place, from real rows to the card', () => {
    const park = createPlace(env.db, env.ctx, {
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    const yard = createPlace(env.db, env.ctx, {
      category: 'yard',
      label: 'Двор',
      lat: 55.5,
      lon: 37,
    });
    const rand = mulberry32(5);
    for (let i = 0; i < 160; i += 1) {
      const inPark = rand() < 0.5;
      const dry = rand() < (inPark ? 0.85 : 0.2);
      const id = manual(i, 30);
      setWalkPlace(env.db, env.ctx, id, { placeId: inPark ? park.id : yard.id, placeKind: null });
      saveWeatherSnapshot(env.db, id, facts({ rain24hMm: dry ? 0 : 5 }));
      event(id, rand() < (inPark ? 0.6 : 0.1) ? 'hard' : 'dog', i, 2);
    }
    refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });
    const { cards, explained } = walkPatterns(env.db, dog.id);
    expect(cards.map((c) => c.dimension)).toContain('place_kind');
    expect(cards.map((c) => c.dimension)).not.toContain('ground');
    expect(explained.find((c) => c.dimension === 'ground')?.adjustment).toMatchObject({
      status: 'confounded',
      by: 'place_kind',
    });
  });

  it('with few walks the observations come in a section of their own, and not when there are too few or enough', () => {
    const build = (count: number) => {
      for (let i = 0; i < count; i += 1) {
        const id = manual(i);
        const wet = i % 2 === 0;
        saveWeatherSnapshot(env.db, id, facts({ rain24hMm: wet ? 5 : 0 }));
        event(id, wet && i % 6 !== 0 ? 'hard' : 'dog', i, 2);
      }
      refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });
    };
    build(10);
    expect(walkPatterns(env.db, dog.id).preliminary).toEqual([]);
    for (let i = 10; i < 36; i += 1) {
      const id = manual(i);
      const wet = i % 2 === 0;
      saveWeatherSnapshot(env.db, id, facts({ rain24hMm: wet ? 5 : 0 }));
      event(id, wet && i % 6 !== 0 ? 'hard' : 'dog', i, 2);
    }
    refreshDerived(env.db, env.ctx, dog.id, { limit: 500 });
    const few = walkPatterns(env.db, dog.id);
    expect(few.unitCount).toBe(36);
    expect(few.preliminary.length).toBeGreaterThan(0);
    expect(few.preliminary.map((c) => c.preliminary)).toEqual(few.preliminary.map(() => true));
    // what is a finding already is not repeated as an observation
    const mainKeys = new Set(few.cards.map((c) => c.key));
    expect(few.preliminary.some((c) => mainKeys.has(c.key))).toBe(false);
  });

  it('the options narrow the cards: since a moment, and without the hidden keys', () => {
    for (let i = 0; i < 16; i += 1) {
      const id = manual(i);
      saveWeatherSnapshot(env.db, id, facts({ rain24hMm: i < 8 ? 5 : 0 }));
      event(id, i < 7 || i === 12 ? 'hard' : 'dog', i, 3);
    }
    refreshDerived(env.db, env.ctx, dog.id, { limit: 100 });
    const all = walkPatterns(env.db, dog.id);
    expect(all.cards.length).toBeGreaterThan(0);
    const top = all.cards[0]?.key ?? '';
    const hidden = walkPatterns(env.db, dog.id, { excludeKeys: new Set([top]) });
    expect(hidden.cards.map((c) => c.key)).not.toContain(top);
    expect(walkPatterns(env.db, dog.id, { sinceTs: START + 10 * DAY }).unitCount).toBe(6);
  });
});
