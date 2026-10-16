import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { addPhoto, addWalkPhoto, listAlbum, photosOnThisDay } from './photos';
import { MIN_CALM_MS, weekBounds, weekRecap } from './recap';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import { createManualWalk } from './walks';

const MIN = 60_000;
const DAY = 86_400_000;
// START is Thursday 15 Oct 2026, 12:00 UTC; that week began on Monday 12 Oct
const MONDAY = Date.UTC(2026, 9, 12);

describe('weekBounds', () => {
  it('starts on Monday and lasts seven days', () => {
    expect(weekBounds(START, 0)).toEqual({ from: MONDAY, to: MONDAY + 7 * DAY });
  });

  it('Monday midnight itself belongs to the new week, the last millisecond to the old one', () => {
    expect(weekBounds(MONDAY, 0).from).toBe(MONDAY);
    expect(weekBounds(MONDAY - 1, 0).from).toBe(MONDAY - 7 * DAY);
  });

  it('follows the local day: Sunday evening UTC is already Monday in UTC+3', () => {
    const sundayEvening = MONDAY - 2 * 60 * MIN; // 22:00 UTC on Sunday
    expect(weekBounds(sundayEvening, 0).from).toBe(MONDAY - 7 * DAY);
    expect(weekBounds(sundayEvening, 180).from).toBe(MONDAY - 3 * 60 * MIN);
  });

  it('works for dates before 1970 and for negative offsets', () => {
    const { from, to } = weekBounds(Date.UTC(1969, 11, 31, 12), -300);
    expect(to - from).toBe(7 * DAY);
    expect(new Date(from - 300 * MIN).getUTCDay()).toBe(1);
  });
});

describe('weekRecap', () => {
  let env: TestEnv;
  let dog: Dog;
  beforeEach(() => {
    env = testEnv();
    dog = createDog(env.db, env.ctx, { name: 'Луна' });
  });
  afterEach(() => {
    env.db.close();
  });

  const walk = (startedAt: number, minutes: number, distanceM = 1000) =>
    createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt,
      durationS: minutes * 60,
      distanceM,
    });
  const mark = (walkId: string, typeId: string, ts: number) =>
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId,
      typeId,
      ts,
      tzOffsetMin: 0,
      incomplete: false,
    });
  const recap = () => weekRecap(env.db, dog.id, MONDAY, MONDAY + 7 * DAY);

  it('an empty week is zeros and nothing to show', () => {
    expect(recap()).toMatchObject({
      totals: { count: 0, durationS: 0, distanceM: 0 },
      longest: null,
      calm: null,
      photo: null,
      photoCount: 0,
      hardCount: 0,
      successCount: 0,
    });
  });

  it('counts this week and the one before, and picks the longest walk', () => {
    walk(MONDAY + 9 * 60 * MIN, 30, 2000);
    const long = walk(MONDAY + DAY, 90, 5000);
    walk(MONDAY - 3 * DAY, 20, 700);
    const r = recap();
    expect(r.totals).toEqual({ count: 2, durationS: 7200, distanceM: 7000 });
    expect(r.previous).toEqual({ count: 1, durationS: 1200, distanceM: 700 });
    expect(r.longest?.id).toBe(long.id);
  });

  it('the calm stretch is the longest time without a hard moment', () => {
    const w = walk(MONDAY, 60);
    mark(w.id, 'hard', MONDAY + 10 * MIN);
    mark(w.id, 'hard', MONDAY + 50 * MIN);
    const other = walk(MONDAY + DAY, 20);
    mark(other.id, 'hard', MONDAY + DAY + 2 * MIN);
    expect(recap().calm).toEqual({
      walkId: w.id,
      startedAt: MONDAY + 10 * MIN,
      durationMs: 40 * MIN,
    });
    expect(recap().hardCount).toBe(3);
  });

  it('a walk without hard moments is calm from start to end; short stretches are ignored', () => {
    const w = walk(MONDAY, 25);
    expect(recap().calm).toMatchObject({ walkId: w.id, durationMs: 25 * MIN });
    mark(w.id, 'hard', MONDAY + 12 * MIN);
    expect(recap().calm?.durationMs).toBe(13 * MIN);
    const short = walk(MONDAY + DAY, 4);
    expect(recap().calm?.walkId).not.toBe(short.id);
    expect(MIN_CALM_MS).toBe(5 * MIN);
  });

  it('removed hard moments do not count', () => {
    const w = walk(MONDAY, 60);
    const hard = mark(w.id, 'hard', MONDAY + 30 * MIN);
    softDelete(env.db, env.ctx, 'event', hard.id);
    expect(recap()).toMatchObject({ hardCount: 0, calm: { durationMs: 60 * MIN } });
  });

  it('counts successes of the week only', () => {
    const w = walk(MONDAY, 30);
    mark(w.id, 'success', MONDAY + 5 * MIN);
    mark(w.id, 'success', MONDAY - 1);
    expect(recap().successCount).toBe(1);
  });

  it('the picture of the week is the first one taken, and all are counted', () => {
    const w = walk(MONDAY, 30);
    addWalkPhoto(env.db, env.ctx, w.id, { uri: 'file:///2.jpg', takenAt: MONDAY + 20 * MIN });
    const early = addWalkPhoto(env.db, env.ctx, w.id, {
      uri: 'file:///1.jpg',
      takenAt: MONDAY + 3 * MIN,
    });
    addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id: w.id },
      { uri: 'file:///old.jpg', takenAt: MONDAY - DAY },
    );
    const r = recap();
    expect(r.photo?.id).toBe(early.id);
    expect(r.photoCount).toBe(2);
  });
});

describe('listAlbum', () => {
  let env: TestEnv;
  let dog: Dog;
  beforeEach(() => {
    env = testEnv();
    dog = createDog(env.db, env.ctx, { name: 'Луна' });
  });
  afterEach(() => {
    env.db.close();
  });

  const event = (walkId: string, ts: number, forDog = dog.id) =>
    createEvent(env.db, env.ctx, {
      dogId: forDog,
      walkId,
      typeId: 'dog',
      ts,
      tzOffsetMin: 0,
      incomplete: false,
    });

  it('lists pictures of walks and their events, newest first, with the walk id', () => {
    const w = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    const e = event(w.id, START + 100_000);
    const a = addWalkPhoto(env.db, env.ctx, w.id, {
      uri: 'file:///a.jpg',
      takenAt: START + 10_000,
    });
    const b = addWalkPhoto(env.db, env.ctx, w.id, {
      uri: 'file:///b.jpg',
      takenAt: START + 110_000,
    });
    expect(b.ownerId).toBe(e.id);
    expect(listAlbum(env.db, dog.id).map((p) => [p.id, p.walkId])).toEqual([
      [b.id, w.id],
      [a.id, w.id],
    ]);
  });

  it('leaves out deleted events and other dogs', () => {
    const w = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 600,
    });
    const other = createDog(env.db, env.ctx, { name: 'Рекс' });
    const otherWalk = createManualWalk(env.db, env.ctx, {
      dogId: other.id,
      startedAt: START,
      durationS: 60,
    });
    addWalkPhoto(env.db, env.ctx, otherWalk.id, { uri: 'file:///x.jpg' });
    const e = event(w.id, START);
    addWalkPhoto(env.db, env.ctx, w.id, { uri: 'file:///e.jpg', takenAt: START });
    softDelete(env.db, env.ctx, 'event', e.id);
    expect(listAlbum(env.db, dog.id)).toEqual([]);
  });
});

describe('photosOnThisDay', () => {
  const at = (y: number, m: number, d: number, h = 12) => ({ takenAt: Date.UTC(y, m, d, h) });
  const now = Date.UTC(2026, 9, 15, 9);

  it('groups the same date of earlier years, nearest year first', () => {
    const groups = photosOnThisDay(
      [at(2024, 9, 15), at(2025, 9, 15), at(2025, 9, 15, 18), at(2025, 9, 16), at(2026, 9, 15)],
      now,
      0,
    );
    expect(groups.map((g) => [g.yearsAgo, g.photos.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it('uses the local date: 23:30 UTC the day before is the same day in UTC+3', () => {
    const late = { takenAt: Date.UTC(2025, 9, 14, 23, 30) };
    expect(photosOnThisDay([late], now, 0)).toEqual([]);
    expect(photosOnThisDay([late], now, 180)).toHaveLength(1);
  });

  it('nothing for a day without a past', () => {
    expect(photosOnThisDay([], now, 0)).toEqual([]);
  });
});
