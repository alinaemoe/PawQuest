import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent, listEventTypes, panelEventTypes } from './events';
import {
  DEFAULT_PANEL,
  MAX_MARK_LABEL,
  PANEL_SLOTS,
  archiveCustomMark,
  createCustomMark,
  resetPanel,
  restoreCustomMark,
  setPanelOrder,
  updateMark,
} from './quickMarks';
import { testEnv, type TestEnv } from './test-utils';

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Луна' });
});
afterEach(() => {
  env.db.close();
});

const panelIds = (): string[] => panelEventTypes(env.db).map((t) => t.id);

describe('the default panel', () => {
  it('starts as the six built-in marks in the documented order', () => {
    expect(panelIds()).toEqual([...DEFAULT_PANEL]);
    expect(panelEventTypes(env.db).map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('setPanelOrder', () => {
  it('puts exactly these marks on the panel in this order and sends the rest to the catalog', () => {
    setPanelOrder(env.db, env.ctx, ['hard', 'play', 'dog']);
    expect(panelIds()).toEqual(['hard', 'play', 'dog']);
    const catalog = listEventTypes(env.db)
      .filter((t) => t.slot === null)
      .map((t) => t.id);
    expect(catalog).toContain('person');
    expect(catalog).toContain('success');
    expect(catalog).not.toContain('hard');
  });

  it('accepts a full panel of nine and an empty panel', () => {
    const nine = ['dog', 'person', 'child', 'animal', 'success', 'hard', 'bike', 'noise', 'cat'];
    setPanelOrder(env.db, env.ctx, nine);
    expect(panelIds()).toEqual(nine);
    setPanelOrder(env.db, env.ctx, []);
    expect(panelIds()).toEqual([]);
  });

  it('refuses more than nine, repeats and unknown marks, and then changes nothing', () => {
    const before = panelIds();
    const ten = [...DEFAULT_PANEL, 'bike', 'noise', 'cat', 'play'];
    expect(ten.length).toBeGreaterThan(PANEL_SLOTS);
    expect(() => {
      setPanelOrder(env.db, env.ctx, ten);
    }).toThrow(RangeError);
    expect(() => {
      setPanelOrder(env.db, env.ctx, ['dog', 'dog']);
    }).toThrow(/only once/);
    expect(() => {
      setPanelOrder(env.db, env.ctx, ['dog', 'unicorn']);
    }).toThrow(/Unknown/);
    expect(panelIds()).toEqual(before);
  });

  it('refuses an archived mark', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' });
    archiveCustomMark(env.db, env.ctx, mark.id);
    expect(() => {
      setPanelOrder(env.db, env.ctx, [mark.id]);
    }).toThrow(/Unknown or archived/);
  });

  it('resetPanel brings the default six back', () => {
    setPanelOrder(env.db, env.ctx, ['play']);
    resetPanel(env.db, env.ctx);
    expect(panelIds()).toEqual([...DEFAULT_PANEL]);
  });
});

describe('custom marks', () => {
  it('creates a mark with a tidied name, its own look, and puts it on the first free slot', () => {
    const mark = createCustomMark(env.db, env.ctx, {
      label: '  Электро   самокат  ',
      look: 'child',
      onPanel: true,
    });
    expect(mark).toMatchObject({
      label: 'Электро самокат',
      labelKey: null,
      color: 'child',
      builtin: false,
      archived: false,
      slot: 6,
    });
    expect(panelIds()).toEqual([...DEFAULT_PANEL, mark.id]);
  });

  it('fills a free slot in the middle of the panel first', () => {
    setPanelOrder(env.db, env.ctx, ['dog', 'person']);
    env.db.run("UPDATE event_type SET slot = 5 WHERE id = 'person'"); // slots 0 and 5 used
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ok', onPanel: true });
    expect(mark.slot).toBe(1);
  });

  it('goes to the catalog only when not asked for the panel or when the panel is full', () => {
    expect(createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' }).slot).toBeNull();
    setPanelOrder(env.db, env.ctx, [
      'dog',
      'person',
      'child',
      'animal',
      'success',
      'hard',
      'bike',
      'noise',
      'cat',
    ]);
    const mark = createCustomMark(env.db, env.ctx, { label: 'Ещё', look: 'ex', onPanel: true });
    expect(mark.slot).toBeNull();
    expect(panelIds()).toHaveLength(PANEL_SLOTS);
  });

  it('cuts a long name and refuses an empty one or an unknown look', () => {
    const long = createCustomMark(env.db, env.ctx, { label: 'я'.repeat(60), look: 'ex' });
    expect(long.label).toHaveLength(MAX_MARK_LABEL);
    expect(() => createCustomMark(env.db, env.ctx, { label: '   ', look: 'ex' })).toThrow(
      /needs a name/,
    );
    expect(() => createCustomMark(env.db, env.ctx, { label: 'x', look: 'purple' as 'ex' })).toThrow(
      /Unknown look/,
    );
  });

  it('appears in the catalog after the built-in marks', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' });
    const types = listEventTypes(env.db);
    expect(types[types.length - 1]?.id).toBe(mark.id);
  });
});

describe('updateMark', () => {
  it('renames a custom mark and changes any mark look', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' });
    expect(updateMark(env.db, env.ctx, mark.id, { label: 'Большая лужа', look: 'animal' })).toBe(
      true,
    );
    const found = listEventTypes(env.db).find((t) => t.id === mark.id);
    expect(found).toMatchObject({ label: 'Большая лужа', color: 'animal' });
    // a built-in mark keeps its translated name but may change its look
    expect(updateMark(env.db, env.ctx, 'bike', { label: 'Другое', look: 'person' })).toBe(true);
    const bike = listEventTypes(env.db).find((t) => t.id === 'bike');
    expect(bike).toMatchObject({ labelKey: 'event.bike', color: 'person' });
    expect(bike?.label).toBeNull();
  });

  it('refuses an empty name for a custom mark and an unknown look, and reports a missing mark', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' });
    expect(() => updateMark(env.db, env.ctx, mark.id, { label: ' ' })).toThrow(/needs a name/);
    expect(() => updateMark(env.db, env.ctx, mark.id, { look: 'x' as 'ex' })).toThrow(
      /Unknown look/,
    );
    expect(updateMark(env.db, env.ctx, 'nope', { look: 'ex' })).toBe(false);
  });
});

describe('archiveCustomMark', () => {
  it('removes a custom mark from the panel and the catalog, but its events keep it', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex', onPanel: true });
    const event = createEvent(env.db, env.ctx, {
      dogId: dog.id,
      typeId: mark.id,
      tzOffsetMin: 0,
      incomplete: false,
    });
    expect(archiveCustomMark(env.db, env.ctx, mark.id)).toBe(true);
    expect(panelIds()).not.toContain(mark.id);
    expect(listEventTypes(env.db).map((t) => t.id)).not.toContain(mark.id);
    // the old event still resolves its mark by name when archived ones are asked for
    expect(listEventTypes(env.db, true).find((t) => t.id === mark.id)?.label).toBe('Лужа');
    expect(env.db.all('SELECT type_id FROM event WHERE id = ?', [event.id])).toEqual([
      { type_id: mark.id },
    ]);
  });

  it('a removed mark can be brought back, to the catalog', () => {
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex', onPanel: true });
    archiveCustomMark(env.db, env.ctx, mark.id);
    expect(restoreCustomMark(env.db, env.ctx, mark.id)).toBe(true);
    const back = listEventTypes(env.db).find((t) => t.id === mark.id);
    expect(back?.slot).toBeNull();
    expect(restoreCustomMark(env.db, env.ctx, mark.id)).toBe(false); // not removed any more
    expect(restoreCustomMark(env.db, env.ctx, 'dog')).toBe(false); // built-in
  });

  it('cannot remove a built-in mark, a missing one, or the same mark twice', () => {
    expect(archiveCustomMark(env.db, env.ctx, 'dog')).toBe(false);
    expect(archiveCustomMark(env.db, env.ctx, 'nope')).toBe(false);
    const mark = createCustomMark(env.db, env.ctx, { label: 'Лужа', look: 'ex' });
    expect(archiveCustomMark(env.db, env.ctx, mark.id)).toBe(true);
    expect(archiveCustomMark(env.db, env.ctx, mark.id)).toBe(false);
    expect(panelIds()).toEqual([...DEFAULT_PANEL]);
  });
});
