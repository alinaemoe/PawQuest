import { EMPTY_FILTER, type FilterOptions, type WalkFilter } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import {
  activeTags,
  emptyReason,
  filterSummary,
  outcomeLabel,
  periodLabel,
  quickStarts,
  toggled,
  withDimension,
} from './walkFilterModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const options: FilterOptions = { places: [{ id: 'p1', name: 'Парк' }], eventTypes: ['dog'] };
const label = (id: string): string => (id === 'dog' ? 'Собака' : id);

describe('walk filter words', () => {
  it('a value is put in or taken out of a list, and of a dimension', () => {
    expect(toggled(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
    const wet = withDimension(EMPTY_FILTER, 'ground', 'wet');
    expect(wet.dims).toEqual({ ground: ['wet'] });
    expect(withDimension(wet, 'ground', 'wet').dims).toEqual({ ground: [] });
    expect(withDimension(wet, 'light', 'dark').dims).toEqual({ ground: ['wet'], light: ['dark'] });
  });

  it('the conditions in a line, in the words of the screen; no conditions is an empty line', () => {
    expect(filterSummary(EMPTY_FILTER, options, label, ru)).toBe('');
    const filter: WalkFilter = {
      days: 30,
      placeIds: ['p1', 'gone'],
      dims: { ground: ['wet', 'damp'], light: [] },
      eventTypes: ['dog'],
      outcomes: ['hard_moment'],
      training: true,
    };
    expect(filterSummary(filter, options, label, ru)).toBe(
      '30 дн. · Парк, … · мокро, влажно · Собака · Трудный момент · Была тренировка',
    );
    expect(periodLabel(null, ru)).toBe('Всё время');
    expect(outcomeLabel('success', ru)).toBe('Успех');
  });

  it('why nothing is shown: the walks still being worked out, or no walk fits', () => {
    const on: WalkFilter = { ...EMPTY_FILTER, days: 7 };
    expect(emptyReason(on, 0, ru)).toContain('Ни одна прогулка');
    expect(emptyReason(on, 3, ru)).toContain('3 прогулок ещё считаются');
    expect(emptyReason(EMPTY_FILTER, 0, ru)).toBe(ru.t('walks.emptyText'));
  });
});

describe('tags and quick starts', () => {
  const filter: WalkFilter = {
    ...EMPTY_FILTER,
    days: 30,
    placeIds: ['p1'],
    dims: { ground: ['wet', 'damp'] },
    eventTypes: ['dog'],
    outcomes: ['success'],
    training: true,
  };

  it('each condition is a tag; taking it off leaves the others as they were', () => {
    const tags = activeTags(filter, options, label, ru);
    expect(tags.map((t) => t.label)).toEqual([
      '30 дн.',
      'Парк',
      'мокро',
      'влажно',
      'Собака',
      'Успех',
      'Была тренировка',
    ]);
    expect(tags[0]?.without).toEqual({ ...filter, days: null });
    expect(tags[2]?.without.dims).toEqual({ ground: ['damp'] });
    expect(tags[1]?.without.placeIds).toEqual([]);
    expect(tags[4]?.without.eventTypes).toEqual([]);
    expect(tags[5]?.without.outcomes).toEqual([]);
    expect(tags[6]?.without.training).toBe(false);
    expect(activeTags(EMPTY_FILTER, options, label, ru)).toEqual([]);
  });

  it('a quick start puts its condition on and keeps the rest', () => {
    const starts = Object.fromEntries(quickStarts(ru).map((q) => [q.key, q]));
    expect(starts['hard']?.apply(EMPTY_FILTER).outcomes).toEqual(['hard_moment']);
    expect(starts['wet']?.apply(EMPTY_FILTER).dims).toEqual({ ground: ['wet'] });
    expect(starts['dark']?.apply({ ...EMPTY_FILTER, days: 7 })).toMatchObject({
      days: 7,
      dims: { light: ['dark'] },
    });
    expect(starts['month']?.apply(EMPTY_FILTER).days).toBe(30);
    expect(starts['training']?.apply(EMPTY_FILTER).training).toBe(true);
  });
});
