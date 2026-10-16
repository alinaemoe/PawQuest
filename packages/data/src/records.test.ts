import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import {
  countIncompleteEvents,
  createEvent,
  getEvent,
  listEvents,
  listEventTypes,
  panelEventTypes,
} from './events';
import { recentFeed } from './feed';
import { toIso } from './ids';
import { MIGRATIONS } from './migrations.generated';
import { START, testEnv, type TestEnv } from './test-utils';
import {
  emptyTrash,
  listTrash,
  purgeExpiredTrash,
  restore,
  softDelete,
  TRASH_DAYS,
  type TrashTable,
} from './trash';
import { createManualWalk, getWalk, lastCompletedWalk, listWalks } from './walks';
import { addWeight, isWeightDue, latestWeight } from './weights';

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

describe('event types seed (migration 0003)', () => {
  it('is applied as migration 3', () => {
    expect(MIGRATIONS[2]?.name).toBe('event_types');
  });

  it('ships the 16 built-in types', () => {
    const types = listEventTypes(env.db);
    expect(types).toHaveLength(16);
    expect(types.every((t) => t.builtin && t.labelKey !== null && t.label === null)).toBe(true);
  });

  it('the quick panel has the six default slots in order (spec 04 §4.3)', () => {
    expect(panelEventTypes(env.db).map((t) => [t.slot, t.id])).toEqual([
      [0, 'dog'],
      [1, 'person'],
      [2, 'child'],
      [3, 'animal'],
      [4, 'success'],
      [5, 'hard'],
    ]);
  });

  it('only "hard" starts the recovery timer; exercise is not on the panel', () => {
    const types = listEventTypes(env.db);
    expect(types.filter((t) => t.startsRecoveryTimer).map((t) => t.id)).toEqual(['hard']);
    expect(types.find((t) => t.id === 'exercise')?.slot).toBeNull();
  });

  it('color tokens are the ones the UI theme defines', () => {
    const known = new Set(['dog', 'person', 'child', 'animal', 'ok', 'hard', 'ex', 'muted']);
    for (const type of listEventTypes(env.db)) {
      expect(known.has(type.color), type.id).toBe(true);
    }
  });
});

describe('events', () => {
  it('a bare tap creates an incomplete event stamped now', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    expect(event).toMatchObject({
      dogId: dog.id,
      typeId: 'dog',
      ts: START,
      walkId: null,
      note: null,
      incomplete: true,
    });
    expect(getEvent(env.db, event.id)).toEqual(event);
  });

  it('keeps the details it is given', () => {
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'hard',
      ts: START - HOUR,
      note: 'велосипед сзади',
      distanceBucket: 'near',
      reaction: 4,
      incomplete: false,
      lat: 55.7,
      lon: 37.6,
    });
    expect(event).toMatchObject({
      ts: START - HOUR,
      note: 'велосипед сзади',
      distanceBucket: 'near',
      reaction: 4,
      incomplete: false,
    });
  });

  it('rejects an unknown type or dog (foreign keys)', () => {
    expect(() => createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'nope' })).toThrow(
      /FOREIGN KEY/,
    );
    expect(() => createEvent(env.db, env.ctx, { dogId: 'ghost', typeId: 'dog' })).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('rejects out-of-range ratings (CHECK)', () => {
    expect(() =>
      createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', reaction: 9 }),
    ).toThrow(/CHECK/);
  });

  it('lists a time range newest first, excluding deleted events', () => {
    const a = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', ts: START });
    const b = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'person', ts: START + HOUR });
    const c = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'cat', ts: START + 2 * HOUR });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', ts: START + DAY });
    softDelete(env.db, env.ctx, 'event', b.id);
    const ids = listEvents(env.db, dog.id, START, START + 3 * HOUR).map((e) => e.id);
    expect(ids).toEqual([c.id, a.id]);
    // the end of the range is exclusive
    expect(listEvents(env.db, dog.id, START, START + 2 * HOUR).map((e) => e.id)).toEqual([a.id]);
  });

  it('counts incomplete observations but not toilet or note events', () => {
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'hard' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'toilet' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'person', incomplete: false });
    expect(countIncompleteEvents(env.db, dog.id)).toBe(2);
  });
});

describe('manual walks', () => {
  it('creates a completed manual walk linked to the dog', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START - 2 * HOUR,
      durationS: 1920,
      distanceM: 1800,
      placeKind: 'park',
      mood: 4,
    });
    expect(walk).toMatchObject({
      status: 'completed',
      mode: 'manual',
      startedAt: START - 2 * HOUR,
      endedAt: START - 2 * HOUR + 1_920_000,
      durationS: 1920,
      distanceM: 1800,
      placeKind: 'park',
      mood: 4,
    });
    expect(env.db.all('SELECT dog_id FROM walk_dog WHERE walk_id = ?', [walk.id])).toEqual([
      { dog_id: dog.id },
    ]);
    expect(env.db.all('SELECT summary_pending FROM walk')[0]).toEqual({ summary_pending: 1 });
  });

  it('everything beyond time and duration is optional', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 0,
    });
    expect(walk).toMatchObject({ distanceM: null, placeKind: null, mood: null, notes: null });
  });

  it('refuses a negative or non-finite duration and writes nothing', () => {
    expect(() =>
      createManualWalk(env.db, env.ctx, { dogId: dog.id, startedAt: START, durationS: -1 }),
    ).toThrow(/duration/);
    expect(() =>
      createManualWalk(env.db, env.ctx, {
        dogId: dog.id,
        startedAt: START,
        durationS: Number.NaN,
      }),
    ).toThrow(/duration/);
    expect(env.db.all('SELECT COUNT(*) AS n FROM walk')[0]).toEqual({ n: 0 });
  });

  it('a failed insert leaves no half-written walk (transaction)', () => {
    expect(() =>
      createManualWalk(env.db, env.ctx, { dogId: 'ghost', startedAt: START, durationS: 60 }),
    ).toThrow(/FOREIGN KEY/);
    expect(env.db.all('SELECT COUNT(*) AS n FROM walk')[0]).toEqual({ n: 0 });
  });

  it('finds the last completed walk and ignores active, discarded and deleted ones', () => {
    const old = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START - 3 * DAY,
      durationS: 600,
    });
    const recent = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START - DAY,
      durationS: 600,
    });
    const newest = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START - HOUR,
      durationS: 600,
    });
    env.db.run("UPDATE walk SET status = 'discarded' WHERE id = ?", [newest.id]);
    expect(lastCompletedWalk(env.db, dog.id)?.id).toBe(recent.id);
    softDelete(env.db, env.ctx, 'walk', recent.id);
    expect(lastCompletedWalk(env.db, dog.id)?.id).toBe(old.id);
    expect(lastCompletedWalk(env.db, 'ghost')).toBeNull();
    expect(getWalk(env.db, recent.id)).toBeNull();
  });

  it('lists walks of a range newest first', () => {
    const a = createManualWalk(env.db, env.ctx, { dogId: dog.id, startedAt: START, durationS: 60 });
    const b = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START + HOUR,
      durationS: 60,
    });
    createManualWalk(env.db, env.ctx, { dogId: dog.id, startedAt: START + DAY, durationS: 60 });
    expect(listWalks(env.db, dog.id, START, START + 2 * HOUR).map((w) => w.id)).toEqual([
      b.id,
      a.id,
    ]);
  });
});

describe('weights', () => {
  it('stores grams as integers and returns the latest weighing', () => {
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6100, measuredAt: START - 20 * DAY });
    const newer = addWeight(env.db, env.ctx, {
      dogId: dog.id,
      weightG: 6240.4,
      measuredAt: START - DAY,
      conditions: 'morning',
    });
    expect(newer.weightG).toBe(6240);
    expect(latestWeight(env.db, dog.id)).toMatchObject({
      weightG: 6240,
      measuredAt: START - DAY,
      conditions: 'morning',
      notes: null,
    });
  });

  it('defaults to now, ignores deleted entries, and null when never weighed', () => {
    expect(latestWeight(env.db, dog.id)).toBeNull();
    const w = addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6000 });
    expect(w.measuredAt).toBe(START);
    softDelete(env.db, env.ctx, 'weight_log', w.id);
    expect(latestWeight(env.db, dog.id)).toBeNull();
  });

  it('rejects zero, negative and non-numeric weights', () => {
    for (const weightG of [0, -5, Number.NaN]) {
      expect(() => addWeight(env.db, env.ctx, { dogId: dog.id, weightG })).toThrow(/positive/);
    }
  });

  it('is due when never weighed or when the interval has passed', () => {
    expect(isWeightDue(null, START, 14)).toBe(true);
    const at = (daysAgo: number) => ({
      id: 'x',
      measuredAt: START - daysAgo * DAY,
      weightG: 6000,
      conditions: null,
      notes: null,
    });
    expect(isWeightDue(at(13), START, 14)).toBe(false);
    expect(isWeightDue(at(14), START, 14)).toBe(true);
    expect(isWeightDue(at(30), START, 60)).toBe(false);
  });
});

describe('trash (G-02)', () => {
  it('softDelete hides a record, restore brings it back, repeats are no-ops', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
    });
    expect(softDelete(env.db, env.ctx, 'walk', walk.id)).toBe(true);
    expect(softDelete(env.db, env.ctx, 'walk', walk.id)).toBe(false);
    expect(getWalk(env.db, walk.id)).toBeNull();
    expect(restore(env.db, env.ctx, 'walk', walk.id)).toBe(true);
    expect(restore(env.db, env.ctx, 'walk', walk.id)).toBe(false);
    expect(getWalk(env.db, walk.id)?.id).toBe(walk.id);
  });

  it('unknown ids and non-trashable tables are handled', () => {
    expect(softDelete(env.db, env.ctx, 'walk', 'missing')).toBe(false);
    expect(() => softDelete(env.db, env.ctx, 'app_setting' as TrashTable, 'x')).toThrow(
      /trashable/,
    );
    expect(() => restore(env.db, env.ctx, 'event_type' as TrashTable, 'x')).toThrow(/trashable/);
  });

  it('lists the trash across tables with readable labels, newest first', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
      title: 'Утро',
    });
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'note',
      note: 'хромала?',
    });
    const weight = addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6200 });
    softDelete(env.db, env.ctx, 'walk', walk.id);
    env.advance(1000);
    softDelete(env.db, env.ctx, 'event', event.id);
    env.advance(1000);
    softDelete(env.db, env.ctx, 'weight_log', weight.id);
    expect(listTrash(env.db).map((i) => [i.table, i.label])).toEqual([
      ['weight_log', '6200'],
      ['event', 'хромала?'],
      ['walk', 'Утро'],
    ]);
    expect(listTrash(env.db)[2]?.deletedAt).toBe(START);
  });

  it('a walk without a title is labelled with its start time; an event without a note by its type', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
    });
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'toilet' });
    softDelete(env.db, env.ctx, 'walk', walk.id);
    softDelete(env.db, env.ctx, 'event', event.id);
    const labels = listTrash(env.db).map((i) => i.label);
    expect(labels).toContain(toIso(START));
    expect(labels).toContain('toilet');
  });

  it('purges only records deleted before the retention limit', () => {
    const old = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    const fresh = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    softDelete(env.db, env.ctx, 'event', old.id);
    env.advance((TRASH_DAYS - 1) * DAY);
    softDelete(env.db, env.ctx, 'event', fresh.id);
    env.advance(2 * DAY); // old: 31 days in the trash, fresh: 2 days
    expect(purgeExpiredTrash(env.db, env.ctx)).toBe(1);
    expect(listTrash(env.db).map((i) => i.id)).toEqual([fresh.id]);
  });

  it('purging a walk also removes its events and dog link (cascade, spec 08 §8.4)', () => {
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
    });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', walkId: walk.id });
    softDelete(env.db, env.ctx, 'walk', walk.id);
    env.advance((TRASH_DAYS + 1) * DAY);
    purgeExpiredTrash(env.db, env.ctx);
    expect(env.db.all('SELECT COUNT(*) AS n FROM event')[0]).toEqual({ n: 0 });
    expect(env.db.all('SELECT COUNT(*) AS n FROM walk_dog')[0]).toEqual({ n: 0 });
  });

  it('emptyTrash removes everything deleted and nothing else', () => {
    const a = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'person' });
    softDelete(env.db, env.ctx, 'event', a.id);
    expect(emptyTrash(env.db)).toBe(1);
    expect(listTrash(env.db)).toEqual([]);
    expect(listEvents(env.db, dog.id, START - DAY, START + DAY)).toHaveLength(1);
  });
});

describe('recent feed (S01-T)', () => {
  const addSession = (id: string, skillId: string, ts: number, attempts: number): void => {
    env.db.run(
      'INSERT INTO training_session (id, dog_id, skill_id, started_at, duration_s, created_at, updated_at) VALUES (?, ?, ?, ?, 120, ?, ?)',
      [id, dog.id, skillId, toIso(ts), toIso(ts), toIso(ts)],
    );
    for (let i = 0; i < attempts; i += 1) {
      env.db.run(
        "INSERT INTO training_attempt (id, session_id, ts, result) VALUES (?, ?, ?, 'successful')",
        [`${id}-a${String(i)}`, id, toIso(ts + i * 1000)],
      );
    }
  };

  beforeEach(() => {
    env.db.run(
      "INSERT INTO skill (id, dog_id, name, created_at, updated_at) VALUES ('s1', ?, 'Подзыв', ?, ?)",
      [dog.id, toIso(START), toIso(START)],
    );
  });

  it('merges all sources newest first with their details', () => {
    createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START - 5 * HOUR,
      durationS: 1800,
      distanceM: 1500,
    });
    addSession('t1', 's1', START - 4 * HOUR, 3);
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'note',
      ts: START - 3 * HOUR,
      note: 'тест',
    });
    env.db.run(
      "INSERT INTO symptom_log (id, dog_id, symptom, started_at, created_at, updated_at) VALUES ('y1', ?, 'cough', ?, ?, ?)",
      [dog.id, toIso(START - 2 * HOUR), toIso(START), toIso(START)],
    );
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6200, measuredAt: START - HOUR });

    const feed = recentFeed(env.db, dog.id, 10);
    expect(feed.map((i) => i.kind)).toEqual(['weight', 'symptom', 'event', 'session', 'walk']);
    expect(feed[0]).toMatchObject({ kind: 'weight', weightG: 6200 });
    expect(feed[1]).toMatchObject({ kind: 'symptom', symptom: 'cough' });
    expect(feed[2]).toMatchObject({ kind: 'event', typeId: 'note', note: 'тест' });
    expect(feed[3]).toMatchObject({ kind: 'session', skillName: 'Подзыв', attempts: 3 });
    expect(feed[4]).toMatchObject({ kind: 'walk', durationS: 1800, distanceM: 1500 });
    expect(feed[4]?.ts).toBe(START - 5 * HOUR);
  });

  it('applies the limit and pages backwards with `before`', () => {
    for (let i = 0; i < 6; i += 1) {
      createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note', ts: START - i * HOUR });
    }
    const first = recentFeed(env.db, dog.id, 5);
    expect(first).toHaveLength(5);
    const rest = recentFeed(env.db, dog.id, 5, first[4]?.ts);
    expect(rest).toHaveLength(1);
    expect(rest[0]?.ts).toBe(START - 5 * HOUR);
  });

  it('leaves out deleted records, other dogs, events inside walks and unfinished walks', () => {
    const other = createDog(env.db, env.ctx, { name: 'Бим' });
    const walk = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
    });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', walkId: walk.id });
    const gone = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note' });
    softDelete(env.db, env.ctx, 'event', gone.id);
    createEvent(env.db, env.ctx, { dogId: other.id, typeId: 'note' });
    const active = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START + HOUR,
      durationS: 60,
    });
    env.db.run("UPDATE walk SET status = 'active' WHERE id = ?", [active.id]);
    expect(recentFeed(env.db, dog.id, 10).map((i) => i.kind)).toEqual(['walk']);
  });

  it('an empty database gives an empty feed', () => {
    expect(recentFeed(env.db, dog.id, 5)).toEqual([]);
  });

  it('sorts equal timestamps deterministically', () => {
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note', ts: START });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'toilet', ts: START });
    const a = recentFeed(env.db, dog.id, 5).map((i) => i.id);
    const b = recentFeed(env.db, dog.id, 5).map((i) => i.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
  });
});
