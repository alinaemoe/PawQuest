import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import {
  createManualWalk,
  getWalk,
  listWalksPage,
  updateWalk,
  walkEventIds,
  walkTotals,
} from './walks';

const HOUR = 3_600_000;
const DAY = 86_400_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const walk = (hoursAgo: number, minutes: number, km?: number) =>
  createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START - hoursAgo * HOUR,
    durationS: minutes * 60,
    distanceM: km === undefined ? null : km * 1000,
  });

describe('walkTotals', () => {
  it('sums count, time and distance of the walks that started in the range', () => {
    walk(1, 30, 2);
    walk(30, 60, 3.5);
    walk(24 * 9, 45, 1); // outside
    expect(walkTotals(env.db, dog.id, START - 7 * DAY, START)).toEqual({
      count: 2,
      durationS: 5400,
      distanceM: 5500,
    });
  });

  it('is all zeros without walks and ignores deleted ones and other dogs', () => {
    expect(walkTotals(env.db, dog.id, START - DAY, START)).toEqual({
      count: 0,
      durationS: 0,
      distanceM: 0,
    });
    const gone = walk(1, 30, 2);
    softDelete(env.db, env.ctx, 'walk', gone.id);
    const other = createDog(env.db, env.ctx, { name: 'Бим' });
    createManualWalk(env.db, env.ctx, { dogId: other.id, startedAt: START - HOUR, durationS: 600 });
    expect(walkTotals(env.db, dog.id, START - DAY, START).count).toBe(0);
  });

  it('walks without a distance add nothing to the distance', () => {
    walk(1, 30);
    expect(walkTotals(env.db, dog.id, START - DAY, START)).toMatchObject({
      count: 1,
      distanceM: 0,
    });
  });
});

describe('listWalksPage', () => {
  it('pages backwards through history, newest first', () => {
    const ids = [1, 2, 3, 4, 5].map((h) => walk(h, 10).id);
    const first = listWalksPage(env.db, dog.id, 2);
    expect(first.map((w) => w.id)).toEqual([ids[0], ids[1]]);
    const second = listWalksPage(env.db, dog.id, 2, first[1]?.startedAt);
    expect(second.map((w) => w.id)).toEqual([ids[2], ids[3]]);
    const third = listWalksPage(env.db, dog.id, 2, second[1]?.startedAt);
    expect(third.map((w) => w.id)).toEqual([ids[4]]);
    expect(listWalksPage(env.db, dog.id, 2, third[0]?.startedAt)).toEqual([]);
  });

  it('leaves out deleted walks', () => {
    const a = walk(1, 10);
    const b = walk(2, 10);
    softDelete(env.db, env.ctx, 'walk', a.id);
    expect(listWalksPage(env.db, dog.id, 10).map((w) => w.id)).toEqual([b.id]);
  });
});

describe('updateWalk', () => {
  it('changing the duration moves the end and keeps the start', () => {
    const w = walk(2, 30, 2);
    const updated = updateWalk(env.db, env.ctx, w.id, { durationS: 45 * 60 });
    expect(updated).toMatchObject({
      durationS: 2700,
      startedAt: w.startedAt,
      endedAt: w.startedAt + 2700_000,
      distanceM: 2000,
    });
  });

  it('updates only what is given and can clear a value with null', () => {
    const w = walk(2, 30, 2);
    updateWalk(env.db, env.ctx, w.id, { notes: 'дождь', mood: 4 });
    expect(updateWalk(env.db, env.ctx, w.id, { distanceM: null })).toMatchObject({
      notes: 'дождь',
      mood: 4,
      distanceM: null,
      durationS: 1800,
    });
  });

  it('records when it was edited and does nothing for an empty change', () => {
    const w = walk(2, 30);
    env.advance(5000);
    updateWalk(env.db, env.ctx, w.id, {});
    expect(env.db.all('SELECT updated_at FROM walk WHERE id = ?', [w.id])[0]).toEqual({
      updated_at: new Date(START).toISOString(),
    });
    updateWalk(env.db, env.ctx, w.id, { title: 'Утро' });
    expect(env.db.all('SELECT updated_at FROM walk WHERE id = ?', [w.id])[0]).toEqual({
      updated_at: new Date(START + 5000).toISOString(),
    });
  });

  it('clears the "can be completed" mark when the summary was seen', () => {
    const w = walk(2, 30);
    updateWalk(env.db, env.ctx, w.id, { summaryPending: false });
    expect(env.db.all('SELECT summary_pending FROM walk WHERE id = ?', [w.id])[0]).toEqual({
      summary_pending: 0,
    });
  });

  it('refuses a bad duration, unknown or deleted walks give null', () => {
    const w = walk(2, 30);
    expect(() => updateWalk(env.db, env.ctx, w.id, { durationS: -5 })).toThrow(/duration/);
    expect(updateWalk(env.db, env.ctx, 'missing', { notes: 'x' })).toBeNull();
    softDelete(env.db, env.ctx, 'walk', w.id);
    expect(updateWalk(env.db, env.ctx, w.id, { notes: 'x' })).toBeNull();
    expect(getWalk(env.db, w.id)).toBeNull();
  });
});

describe('walkEventIds', () => {
  it('lists the events of a walk in time order, without deleted ones', () => {
    const w = walk(2, 60);
    const a = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'dog',
      walkId: w.id,
      ts: START - HOUR,
    });
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'hard',
      walkId: w.id,
      ts: START - 2 * HOUR,
    });
    softDelete(env.db, env.ctx, 'event', a.id);
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'success', walkId: w.id, ts: START });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note', ts: START }); // not on this walk
    expect(walkEventIds(env.db, w.id).map((e) => e.typeId)).toEqual(['hard', 'success']);
  });
});
