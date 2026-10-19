import { EMPTY_FILTER, type FilterOptions, type WalkFilter } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import {
  emptyReason,
  filterSummary,
  outcomeLabel,
  periodLabel,
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
