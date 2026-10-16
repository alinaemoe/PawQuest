import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DETAIL_FIELD_COUNT,
  EMPTY_DETAIL,
  filledFields,
  getEventDetail,
  listDiary,
  saveEventDetail,
  updateEvent,
} from './diary';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';

const HOUR = 3_600_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

describe('event details (ABC)', () => {
  it('an event without details reads as empty', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    expect(getEventDetail(env.db, event.id)).toEqual(EMPTY_DETAIL);
  });

  it('saves and reads back every field', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    const detail = {
      antecedent: 'шли спокойно',
      behaviors: ['stare', 'freeze'],
      ownerActions: ['moveAway', 'treat'],
      outcome: 'calmed_fast' as const,
      consequenceNote: 'за 40 с',
      interpretation: 'испугалась лая',
    };
    saveEventDetail(env.db, env.ctx, event.id, detail);
    expect(getEventDetail(env.db, event.id)).toEqual(detail);
  });

  it('saving again replaces the details instead of adding a second row', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    saveEventDetail(env.db, env.ctx, event.id, { ...EMPTY_DETAIL, behaviors: ['bark'] });
    saveEventDetail(env.db, env.ctx, event.id, {
      ...EMPTY_DETAIL,
      behaviors: ['pull'],
      outcome: 'ongoing',
    });
    expect(getEventDetail(env.db, event.id)).toMatchObject({
      behaviors: ['pull'],
      outcome: 'ongoing',
    });
    expect(env.db.all('SELECT COUNT(*) AS n FROM event_detail')[0]).toEqual({ n: 1 });
  });

  it('empty strings and corrupt lists read as nothing', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    env.db.run(
      "INSERT INTO event_detail (event_id, antecedent, behaviors, owner_actions, updated_at) VALUES (?, '', '{broken', '[1,\"x\"]', ?)",
      [event.id, new Date(START).toISOString()],
    );
    expect(getEventDetail(env.db, event.id)).toMatchObject({
      antecedent: null,
      behaviors: [],
      ownerActions: ['x'],
    });
  });

  it('details disappear with their event (cascade)', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    saveEventDetail(env.db, env.ctx, event.id, { ...EMPTY_DETAIL, behaviors: ['bark'] });
    env.db.run('DELETE FROM event WHERE id = ?', [event.id]);
    expect(env.db.all('SELECT COUNT(*) AS n FROM event_detail')[0]).toEqual({ n: 0 });
  });

  it('rejects an unknown outcome (CHECK)', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    expect(() => {
      saveEventDetail(env.db, env.ctx, event.id, { ...EMPTY_DETAIL, outcome: 'fine' as never });
    }).toThrow(/CHECK/);
  });
});

describe('updateEvent', () => {
  it('changes only the given fields and stamps the edit time', () => {
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'dog',
      note: 'сначала',
      reaction: 2,
    });
    env.advance(5000);
    expect(
      updateEvent(env.db, env.ctx, event.id, {
        typeId: 'hard',
        reaction: 4,
        distanceBucket: 'near',
        recoveryS: 40,
        distraction: 3,
        incomplete: false,
      }),
    ).toBe(true);
    const row = env.db.all('SELECT * FROM event WHERE id = ?', [event.id])[0];
    expect(row).toMatchObject({
      type_id: 'hard',
      note: 'сначала',
      reaction: 4,
      distance_bucket: 'near',
      recovery_s: 40,
      distraction: 3,
      incomplete: 0,
      updated_at: new Date(START + 5000).toISOString(),
    });
  });

  it('can move the time and clear a value with null', () => {
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: 'dog',
      note: 'x',
      reaction: 3,
    });
    updateEvent(env.db, env.ctx, event.id, { ts: START - HOUR, note: null, reaction: null });
    expect(env.db.all('SELECT ts, note, reaction FROM event WHERE id = ?', [event.id])[0]).toEqual({
      ts: new Date(START - HOUR).toISOString(),
      note: null,
      reaction: null,
    });
  });

  it('an empty change reports whether the event exists; unknown and deleted ones are false', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    expect(updateEvent(env.db, env.ctx, event.id, {})).toBe(true);
    expect(updateEvent(env.db, env.ctx, 'missing', { note: 'x' })).toBe(false);
    expect(updateEvent(env.db, env.ctx, 'missing', {})).toBe(false);
    softDelete(env.db, env.ctx, 'event', event.id);
    expect(updateEvent(env.db, env.ctx, event.id, { note: 'x' })).toBe(false);
  });

  it('rejects an invalid rating (CHECK) and writes nothing', () => {
    const event = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', reaction: 2 });
    expect(() => updateEvent(env.db, env.ctx, event.id, { reaction: 9 })).toThrow(/CHECK/);
    expect(env.db.all('SELECT reaction FROM event WHERE id = ?', [event.id])[0]).toEqual({
      reaction: 2,
    });
  });
});

describe('listDiary', () => {
  it('lists observations newest first with their details and pages backwards', () => {
    const ids = [3, 2, 1].map(
      (h) =>
        createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog', ts: START - h * HOUR }).id,
    );
    saveEventDetail(env.db, env.ctx, ids[2] ?? '', { ...EMPTY_DETAIL, behaviors: ['bark'] });
    const page = listDiary(env.db, dog.id, 2);
    expect(page.map((e) => e.event.id)).toEqual([ids[2], ids[1]]);
    expect(page[0]?.detail.behaviors).toEqual(['bark']);
    const rest = listDiary(env.db, dog.id, 2, { before: page[1]?.event.ts ?? 0 });
    expect(rest.map((e) => e.event.id)).toEqual([ids[0]]);
  });

  it('the "can be completed" filter keeps incomplete observations, not toilet or note', () => {
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'toilet' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'note' });
    createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'hard', incomplete: false });
    const filtered = listDiary(env.db, dog.id, 10, { onlyIncomplete: true });
    expect(filtered.map((e) => e.event.typeId)).toEqual(['dog']);
    expect(listDiary(env.db, dog.id, 10)).toHaveLength(4);
  });

  it('leaves out deleted events and other dogs', () => {
    const other = createDog(env.db, env.ctx, { name: 'Бим' });
    const gone = createEvent(env.db, env.ctx, { dogId: dog.id, typeId: 'dog' });
    softDelete(env.db, env.ctx, 'event', gone.id);
    createEvent(env.db, env.ctx, { dogId: other.id, typeId: 'dog' });
    expect(listDiary(env.db, dog.id, 10)).toEqual([]);
  });
});

describe('filledFields', () => {
  const base = { distanceBucket: null, reaction: null, note: null, distraction: null } as const;

  it('counts the eight detail fields', () => {
    expect(DETAIL_FIELD_COUNT).toBe(8);
    expect(filledFields(base, EMPTY_DETAIL)).toBe(0);
    expect(
      filledFields(
        { distanceBucket: 'near', reaction: 3, note: 'x', distraction: 2 },
        {
          antecedent: null,
          behaviors: ['bark'],
          ownerActions: ['treat'],
          outcome: 'ongoing',
          consequenceNote: null,
          interpretation: 'думаю',
        },
      ),
    ).toBe(8);
  });

  it('the antecedent and consequence notes alone do not count as a field', () => {
    expect(
      filledFields(base, { ...EMPTY_DETAIL, antecedent: 'шли', consequenceNote: 'потом' }),
    ).toBe(0);
  });
});
