import { describe, expect, it } from 'vitest';

import {
  defaultPlaceName,
  findDuplicates,
  guessCategory,
  nameKey,
  nameSimilarity,
  tidyName,
  type LibraryPlace,
} from './names';

describe('tidyName', () => {
  it.each([
    ['  парк   у   дома  ', 'Парк у дома'],
    ['парк у дома!!!', 'Парк у дома'],
    ['ПАРК У ДОМА', 'Парк у дома'],
    ['ПАРК дома', 'Парк дома'],
    ['луг за школой 🌳', 'Луг за школой'],
    ['Парк Победы', 'Парк Победы'],
    ['park near home', 'Park near home'],
    ['ёлочки', 'Ёлочки'],
    ['Парк-сквер', 'Парк-сквер'],
    ["Dog's corner", "Dog's corner"],
    ['A', 'A'],
    ['!!!', ''],
    ['   ', ''],
    ['', ''],
    ['12345', '12345'],
  ])('cleans %j to %j', (raw, expected) => {
    expect(tidyName(raw)).toBe(expected);
  });

  const count = (text: string): number =>
    Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;

  it('limits the name to 40 characters', () => {
    expect(count(tidyName('а'.repeat(100)))).toBe(40);
  });

  it('never exceeds the limit and keeps letters whole', () => {
    const t = tidyName('ё'.repeat(39) + '😀😀');
    expect(count(t)).toBeLessThanOrEqual(40);
    expect(t.startsWith('Ё')).toBe(true);
  });
});

describe('nameKey', () => {
  it.each([
    ['Парк у дома', 'дома парк'],
    ['парк дома', 'дома парк'],
    ['ПАРК   У   ДОМА!', 'дома парк'],
    ['Луг за школой', 'луг школой'],
    ['парк возле дома', 'дома парк'],
    ['Парк около дома', 'дома парк'],
    ['Ёлочный парк', 'елочный парк'],
    ['у', ''],
    ['', ''],
  ])('maps %j to the key %j', (raw, key) => {
    expect(nameKey(raw)).toBe(key);
  });

  it('gives the same key for word order variants', () => {
    expect(nameKey('дома парк')).toBe(nameKey('парк дома'));
  });
});

describe('guessCategory', () => {
  // [input, expected type]; includes traps where a naive root match would be wrong.
  it.each([
    ['Парк у дома', 'park'],
    ['парк', 'park'],
    ['Сквер на Ленина', 'park'],
    ['Central Park', 'park'],
    ['Луг за школой', 'meadow'],
    ['большой луг', 'meadow'],
    ['Поле за домом', 'meadow'],
    ['Лужайка', 'meadow'],
    ['Поляна', 'meadow'],
    ['Пустырь', 'meadow'],
    ['green field', 'meadow'],
    ['Двор', 'yard'],
    ['Наш двор', 'yard'],
    ['дворик', 'yard'],
    ['my yard', 'yard'],
    ['Район Академический', 'district'],
    ['Микрорайон 5', 'district'],
    ['мкр Северный', 'district'],
    ['Старый квартал', 'district'],
    ['Лес', 'forest'],
    ['Лесопарк', 'forest'],
    ['берёзовая роща', 'forest'],
    ['Лесной массив', 'forest'],
    ['Набережная', 'waterfront'],
    ['Пруд', 'waterfront'],
    ['озеро', 'waterfront'],
    ['у реки', 'waterfront'],
    ['Пляж', 'waterfront'],
    ['Площадка для собак', 'dog_area'],
    ['dog park', 'dog_area'],
    ['Собачья площадка', 'dog_area'],
    ['Улица Мира', 'street'],
    ['Проспект', 'street'],
    ['Бульвар', 'street'],
    ['Тихий переулок', 'street'],
    ['Ветклиника', 'vet'],
    ['Ветеринарная клиника', 'vet'],
    ['vet', 'vet'],
    // first word with a known root wins, in the order the words were typed
    ['двор парка', 'yard'],
    ['парк у двора', 'park'],
    ['Площадка в парке', 'dog_area'],
    ['Парк с площадкой', 'park'],
    // traps: these words only look like a root
    ['Парковка', null],
    ['паркинг у дома', null],
    ['полиция', null],
    ['Дворец', null],
    ['ветер', null],
    ['лестница', null],
    ['квартира', null],
    ['лужа', null],
    ['', null],
    ['!!!', null],
    ['Мой любимый маршрут', null],
  ])('infers the type of %j as %s', (raw, expected) => {
    expect(guessCategory(raw)).toBe(expected);
  });
});

describe('nameSimilarity', () => {
  it('is 1 for equal keys and 0 for two empty keys', () => {
    expect(nameSimilarity('дома парк', 'дома парк')).toBe(1);
    expect(nameSimilarity('', '')).toBe(0);
  });

  it('is symmetric', () => {
    expect(nameSimilarity('дома парк', 'домашний парк')).toBeCloseTo(
      nameSimilarity('домашний парк', 'дома парк'),
      12,
    );
  });

  it('finds a typo close and unrelated names far', () => {
    expect(nameSimilarity('дома парк', 'дома парки')).toBeGreaterThan(0.6);
    expect(nameSimilarity('дома парк', 'набережная')).toBeLessThan(0.3);
  });
});

describe('findDuplicates', () => {
  const library: LibraryPlace[] = [
    {
      id: 'home-park',
      nameNorm: nameKey('Парк у дома'),
      category: 'park',
      lat: 55,
      lon: 37,
      radiusM: 60,
    },
    {
      id: 'meadow',
      nameNorm: nameKey('Луг за школой'),
      category: 'meadow',
      lat: 55.01,
      lon: 37.01,
    },
    {
      id: 'embankment',
      nameNorm: nameKey('Набережная'),
      category: 'waterfront',
      aliases: ['речка'],
    },
  ];

  it('finds the same place typed differently (case, service words, order)', () => {
    for (const raw of ['парк дома', 'ПАРК У ДОМА', 'Парк возле дома', 'дома парк']) {
      expect(findDuplicates(raw, library)[0]).toMatchObject({ id: 'home-park', reason: 'name' });
    }
  });

  it('finds a typo', () => {
    expect(findDuplicates('парк дома!', library)[0]?.id).toBe('home-park');
    expect(findDuplicates('Парк у дома 2', library)[0]?.id).toBe('home-park');
  });

  it('matches a confirmed alias with score 1', () => {
    expect(findDuplicates('Речка', library)[0]).toEqual({
      id: 'embankment',
      score: 1,
      reason: 'alias',
    });
  });

  it('finds nothing for an unrelated name', () => {
    expect(findDuplicates('Ветклиника на Мира', library)).toEqual([]);
    expect(findDuplicates('', library)).toEqual([]);
  });

  it('finds a place by location and type even when the names differ', () => {
    const near = { lat: 55.0002, lon: 37 }; // about 22 m away
    const result = findDuplicates('Тропинка', library, { point: near, category: 'park' });
    expect(result[0]).toEqual({ id: 'home-park', score: 0.6, reason: 'geo' });
  });

  it('uses the type guessed from the name for the location check', () => {
    const result = findDuplicates('Мой парк', library, { point: { lat: 55.0002, lon: 37 } });
    expect(result.map((r) => r.id)).toContain('home-park');
  });

  it('does not match by location when the type differs or the place is outside the radius', () => {
    expect(
      findDuplicates('Тропинка', library, { point: { lat: 55.0002, lon: 37 }, category: 'yard' }),
    ).toEqual([]);
    expect(
      findDuplicates('Тропинка', library, { point: { lat: 55.002, lon: 37 }, category: 'park' }),
    ).toEqual([]);
  });

  it('returns at most 3 candidates, best first', () => {
    const many: LibraryPlace[] = ['a', 'b', 'c', 'd'].map((suffix) => ({
      id: suffix,
      nameNorm: nameKey(`Парк ${suffix}`),
    }));
    const result = findDuplicates('Парк a', many);
    expect(result).toHaveLength(3);
    expect(result[0]?.id).toBe('a');
  });
});

describe('defaultPlaceName', () => {
  it('uses the label when it is free', () => {
    expect(defaultPlaceName('Луг', [])).toBe('Луг');
    expect(defaultPlaceName('Луг', ['Парк'])).toBe('Луг');
  });

  it('adds the first free number from 2 when taken (case-insensitive)', () => {
    expect(defaultPlaceName('Луг', ['Луг'])).toBe('Луг 2');
    expect(defaultPlaceName('Луг', ['луг', 'Луг 2'])).toBe('Луг 3');
    expect(defaultPlaceName('Луг', ['Луг', 'Луг 3'])).toBe('Луг 2');
  });
});
