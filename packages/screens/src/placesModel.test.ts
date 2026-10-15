import { createI18n } from '@pawquest/i18n';
import { PLACE_CATEGORIES, type Place, type PlaceStats } from '@pawquest/data';
import { describe, expect, it } from 'vitest';

import {
  categoryFromGuess,
  categoryLabel,
  filterPlaces,
  groupPlaces,
  placeRow,
  RADIUS_STEPS,
  stepRadius,
  tidyPair,
  withQualifier,
} from './placesModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 15, 11, 5);
const DAY = 86_400_000;

const place = (extra: Partial<PlaceStats> = {}): PlaceStats => ({
  id: 'p1',
  name: 'Парк у дома',
  category: 'park',
  lat: 55.75,
  lon: 37.6,
  radiusM: 60,
  notes: null,
  visits: 12,
  lastVisitAt: NOW - DAY,
  ...extra,
});

describe('category labels', () => {
  it('every category has a label in both languages', () => {
    for (const c of PLACE_CATEGORIES) {
      expect(categoryLabel(c, ru)).not.toBe('');
      expect(categoryLabel(c, en)).not.toBe('');
    }
    expect(categoryLabel('dog_area', ru)).toBe('Площадка');
    expect(categoryLabel('busy_street', en)).toBe('Busy street');
    expect(categoryLabel('shop', ru)).toBe('Магазин');
    expect(categoryLabel('grooming', ru)).toBe('Груминг');
    expect(categoryLabel('home', en)).toBe('Home');
    expect(categoryLabel('guests', ru)).toBe('Гости');
    expect(PLACE_CATEGORIES).toHaveLength(17);
  });

  it('a guessed street becomes a quiet street, other guesses stay', () => {
    expect(categoryFromGuess('street')).toBe('quiet_street');
    expect(categoryFromGuess('forest')).toBe('forest');
  });
});

describe('placeRow', () => {
  it('shows visits and the last one', () => {
    expect(placeRow(place(), ru, NOW).subtitle).toBe('12 визитов · последний вчера');
    expect(placeRow(place({ visits: 1 }), ru, NOW).subtitle).toBe('1 визит · последний вчера');
    expect(placeRow(place({ visits: 3 }), en, NOW).subtitle).toBe('3 visits · last yesterday');
  });
  it('a place without walks says so', () => {
    expect(placeRow(place({ visits: 0, lastVisitAt: null }), ru, NOW).subtitle).toBe(
      'Пока без прогулок',
    );
  });
});

describe('groupPlaces and filterPlaces', () => {
  const rows = [
    placeRow(place({ id: 'a', name: 'Двор', category: 'yard' }), ru, NOW),
    placeRow(place({ id: 'b', name: 'Парк у реки' }), ru, NOW),
    placeRow(place({ id: 'c', name: 'Парк у дома' }), ru, NOW),
    placeRow(place({ id: 'd', name: 'Ёлки', category: 'forest' }), ru, NOW),
  ];

  it('groups in the order of the type list and drops empty groups', () => {
    const groups = groupPlaces(rows, ru);
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Парк', ['b', 'c']],
      ['Лес', ['d']],
      ['Двор', ['a']],
    ]);
    expect(groupPlaces([], ru)).toEqual([]);
  });

  it('searches any part of the name, ignoring case, spacing and е/ё', () => {
    expect(filterPlaces(rows, '').length).toBe(4);
    expect(filterPlaces(rows, 'РЕКИ').map((r) => r.id)).toEqual(['b']);
    expect(filterPlaces(rows, 'елки').map((r) => r.id)).toEqual(['d']);
    expect(filterPlaces(rows, 'дома парк').map((r) => r.id)).toEqual(['c']);
    expect(filterPlaces(rows, 'нет такого')).toEqual([]);
  });
});

describe('withQualifier', () => {
  it('adds the qualifier to the typed name or to the type name', () => {
    expect(withQualifier('', 'Луг', 'у дома')).toBe('Луг у дома');
    expect(withQualifier('  Дубки ', 'Парк', 'у реки')).toBe('Дубки у реки');
  });
  it('does not repeat a qualifier that is already there', () => {
    expect(withQualifier('Луг у дома', 'Луг', 'у дома')).toBe('Луг у дома');
    expect(withQualifier('Луг У ДОМА', 'Луг', 'у дома')).toBe('Луг У ДОМА');
  });
});

describe('tidyPair', () => {
  it('words the pair and gives a stable key', () => {
    const a: Place = { ...place(), id: 'a', name: 'Парк у дома' };
    const b: Place = { ...place(), id: 'b', name: 'Парк дома' };
    expect(tidyPair({ keep: a, other: b }, ru)).toEqual({
      key: 'a|b',
      keepId: 'a',
      otherId: 'b',
      text: 'Похоже на одно место: «Парк у дома» и «Парк дома»',
    });
  });
});

describe('stepRadius', () => {
  it('moves one listed size up or down from the nearest one', () => {
    expect(stepRadius(60, 1)).toBe(80);
    expect(stepRadius(60, -1)).toBe(50);
    expect(stepRadius(326, 1)).toBe(400); // nearest listed size is 300
    expect(stepRadius(326, -1)).toBe(200);
  });
  it('stays at the ends of the range', () => {
    expect(stepRadius(15, -1)).toBe(15);
    expect(stepRadius(1000, 1)).toBe(1000);
    expect(RADIUS_STEPS[0]).toBe(15);
  });
});
