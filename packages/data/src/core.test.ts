import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, getDog, listDogs, updateDog } from './dogs';
import { createCtx, expectFound, fromIso, toIso, uuidv7 } from './ids';
import { DEFAULT_SETTINGS, getSettings, setSetting } from './settings';
import { START, testEnv, type TestEnv } from './test-utils';

let env: TestEnv;
beforeEach(() => {
  env = testEnv();
});
afterEach(() => {
  env.db.close();
});

describe('uuidv7', () => {
  const seq = (): (() => number) => {
    let i = 0;
    return () => (i++ % 97) / 97;
  };

  it('has the v7 layout: version nibble 7 and RFC variant', () => {
    const id = uuidv7(START, seq());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('starts with the millisecond timestamp, so later ids sort later', () => {
    const a = uuidv7(START, seq());
    const b = uuidv7(START + 1, seq());
    const c = uuidv7(START + 86_400_000, seq());
    expect(a.slice(0, 13) < b.slice(0, 13)).toBe(true);
    expect([c, b, a].sort()).toEqual([a, b, c]);
    expect(Number.parseInt(a.replace('-', '').slice(0, 12), 16)).toBe(START);
  });

  it('is deterministic for a given random source and differs between draws', () => {
    expect(uuidv7(START, seq())).toBe(uuidv7(START, seq()));
    const ctx = createCtx(() => START);
    expect(ctx.newId()).not.toBe(ctx.newId());
  });

  it('converts between ISO strings and epoch milliseconds', () => {
    expect(toIso(START)).toBe('2026-10-15T12:00:00.000Z');
    expect(fromIso(toIso(START))).toBe(START);
  });

  it('expectFound returns the value or explains what is missing', () => {
    expect(expectFound('x', 'dog')).toBe('x');
    expect(() => expectFound(null, 'dog')).toThrow(/dog was not found/);
  });

  it('createCtx defaults to the real clock', () => {
    const before = Date.now();
    const ctx = createCtx();
    expect(ctx.now()).toBeGreaterThanOrEqual(before);
    expect(ctx.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('settings', () => {
  it('returns the defaults on an empty database', () => {
    expect(getSettings(env.db)).toEqual(DEFAULT_SETTINGS);
  });

  it('does not share mutable defaults between calls', () => {
    getSettings(env.db).goals.push('calm');
    expect(getSettings(env.db).goals).toEqual([]);
  });

  it('round-trips every setting', () => {
    setSetting(env.db, env.ctx, 'language', 'en');
    setSetting(env.db, env.ctx, 'units', 'imperial');
    setSetting(env.db, env.ctx, 'palette', 'berry');
    setSetting(env.db, env.ctx, 'scheme', 'dark');
    setSetting(env.db, env.ctx, 'haptics', false);
    setSetting(env.db, env.ctx, 'onboardingDone', true);
    setSetting(env.db, env.ctx, 'activeDogId', 'abc');
    setSetting(env.db, env.ctx, 'goals', ['recall', 'diary']);
    setSetting(env.db, env.ctx, 'hiddenModules', ['quests']);
    setSetting(env.db, env.ctx, 'weightIntervalDays', 30);
    expect(getSettings(env.db)).toEqual({
      language: 'en',
      units: 'imperial',
      palette: 'berry',
      scheme: 'dark',
      haptics: false,
      onboardingDone: true,
      activeDogId: 'abc',
      goals: ['recall', 'diary'],
      hiddenModules: ['quests'],
      weightIntervalDays: 30,
    });
  });

  it('overwrites a value and records when', () => {
    setSetting(env.db, env.ctx, 'palette', 'sea');
    env.advance(5000);
    setSetting(env.db, env.ctx, 'palette', 'sun');
    expect(getSettings(env.db).palette).toBe('sun');
    expect(env.db.all('SELECT updated_at FROM app_setting WHERE key = ?', ['palette'])).toEqual([
      { updated_at: toIso(START + 5000) },
    ]);
  });

  it('activeDogId can be cleared with null', () => {
    setSetting(env.db, env.ctx, 'activeDogId', 'abc');
    setSetting(env.db, env.ctx, 'activeDogId', null);
    expect(getSettings(env.db).activeDogId).toBeNull();
  });

  it('rejects invalid values on write', () => {
    expect(() => {
      setSetting(env.db, env.ctx, 'palette', 'neon' as never);
    }).toThrow(/Invalid value/);
    expect(() => {
      setSetting(env.db, env.ctx, 'goals', ['recall', 'teleport'] as never);
    }).toThrow();
    expect(() => {
      setSetting(env.db, env.ctx, 'weightIntervalDays', 0);
    }).toThrow();
    expect(() => {
      setSetting(env.db, env.ctx, 'weightIntervalDays', 1.5);
    }).toThrow();
  });

  it('falls back to defaults for corrupt, invalid or unknown stored values', () => {
    const put = (key: string, value: string): void => {
      env.db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', [
        key,
        value,
        toIso(START),
      ]);
    };
    put('palette', '"neon"');
    put('language', '{not json');
    put('haptics', '"yes"');
    put('weightIntervalDays', '999');
    put('futureSetting', '1');
    put('units', '"imperial"');
    const settings = getSettings(env.db);
    expect(settings.palette).toBe(DEFAULT_SETTINGS.palette);
    expect(settings.language).toBe('ru');
    expect(settings.haptics).toBe(true);
    expect(settings.weightIntervalDays).toBe(14);
    expect(settings.units).toBe('imperial');
    expect('futureSetting' in settings).toBe(false);
  });
});

describe('dogs', () => {
  it('creates a dog with trimmed name and optional details', () => {
    const dog = createDog(env.db, env.ctx, {
      name: '  Луна ',
      birthDate: '2025-09-01',
      sex: 'female',
      size: 'small',
      breed: 'цвергшнауцер',
    });
    expect(dog).toMatchObject({
      name: 'Луна',
      birthDate: '2025-09-01',
      sex: 'female',
      size: 'small',
      breed: 'цвергшнауцер',
      photoUri: null,
      approxAgeMonths: null,
      archived: false,
      isDemo: false,
    });
    expect(getDog(env.db, dog.id)).toEqual(dog);
  });

  it('needs a non-empty name', () => {
    expect(() => createDog(env.db, env.ctx, { name: '   ' })).toThrow(/name/);
  });

  it('stores an approximate age when the birth date is unknown', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Бим', approxAgeMonths: 14, isDemo: true });
    expect(dog.approxAgeMonths).toBe(14);
    expect(dog.birthDate).toBeNull();
    expect(dog.isDemo).toBe(true);
  });

  it('lists active dogs oldest first and skips archived and deleted ones', () => {
    const a = createDog(env.db, env.ctx, { name: 'A' });
    env.advance(1000);
    const b = createDog(env.db, env.ctx, { name: 'B' });
    env.advance(1000);
    const c = createDog(env.db, env.ctx, { name: 'C' });
    env.db.run('UPDATE dog SET archived = 1 WHERE id = ?', [b.id]);
    env.db.run('UPDATE dog SET deleted_at = ? WHERE id = ?', [toIso(START), c.id]);
    expect(listDogs(env.db).map((d) => d.name)).toEqual(['A']);
    expect(getDog(env.db, c.id)).toBeNull();
    expect(a.id).not.toBe(b.id);
  });

  it('updates only the given fields, and can clear one with null', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Луна', breed: 'цверг', sex: 'female' });
    env.advance(1000);
    const updated = updateDog(env.db, env.ctx, dog.id, { name: ' Луня ', breed: null });
    expect(updated).toMatchObject({ name: 'Луня', breed: null, sex: 'female' });
    expect(env.db.all('SELECT updated_at FROM dog WHERE id = ?', [dog.id])).toEqual([
      { updated_at: toIso(START + 1000) },
    ]);
  });

  it('an empty update changes nothing and an unknown id gives null', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Луна' });
    expect(updateDog(env.db, env.ctx, dog.id, {})).toEqual(dog);
    expect(updateDog(env.db, env.ctx, 'missing', { name: 'X' })).toBeNull();
  });

  it('refuses to rename a dog to nothing', () => {
    const dog = createDog(env.db, env.ctx, { name: 'Луна' });
    expect(() => updateDog(env.db, env.ctx, dog.id, { name: ' ' })).toThrow(/name/);
    expect(getDog(env.db, dog.id)?.name).toBe('Луна');
  });
});
