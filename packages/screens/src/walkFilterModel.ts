import { countConditions, type FilterOptions, type WalkFilter } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { valueLabel } from './insightsModel';

/** The words and the choices of the walk filter (docs/23, step 3.17). */

export const FILTER_PERIODS = [null, 7, 30, 90] as const;
export const FILTER_GROUND = ['dry', 'damp', 'wet', 'snow', 'icy'] as const;
export const FILTER_LIGHT = ['day', 'twilight', 'dark'] as const;
export const FILTER_PLACE_KIND = ['green', 'streets', 'water', 'errands', 'base'] as const;
export const FILTER_OUTCOMES = ['hard_moment', 'success'] as const;

export type FilterDimension = 'ground' | 'light' | 'place_kind';

/** The list with a value put in or taken out. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function withDimension(
  filter: WalkFilter,
  dimension: FilterDimension,
  value: string,
): WalkFilter {
  return {
    ...filter,
    dims: { ...filter.dims, [dimension]: toggled(filter.dims[dimension] ?? [], value) },
  };
}

export function periodLabel(days: number | null, i18n: I18n): string {
  return days === null ? i18n.t('filter.period.all') : i18n.t('filter.period.days', { n: days });
}

export function outcomeLabel(outcome: (typeof FILTER_OUTCOMES)[number], i18n: I18n): string {
  return i18n.t(`filter.outcome.${outcome}` as MessageKey);
}

/** "30 дней · мокро · Парк": the conditions in a line, empty when there are none. */
export function filterSummary(
  filter: WalkFilter,
  options: FilterOptions,
  typeLabel: (typeId: string) => string,
  i18n: I18n,
): string {
  const parts: string[] = [];
  if (filter.days !== null) {
    parts.push(periodLabel(filter.days, i18n));
  }
  const names = new Map(options.places.map((p) => [p.id, p.name]));
  if (filter.placeIds.length > 0) {
    parts.push(filter.placeIds.map((id) => names.get(id) ?? '…').join(', '));
  }
  for (const [dimension, values] of Object.entries(filter.dims)) {
    if (values.length > 0) {
      parts.push(values.map((v) => valueLabel(i18n, dimension, v)).join(', '));
    }
  }
  if (filter.eventTypes.length > 0) {
    parts.push(filter.eventTypes.map(typeLabel).join(', '));
  }
  if (filter.outcomes.length > 0) {
    parts.push(filter.outcomes.map((o) => outcomeLabel(o, i18n)).join(', '));
  }
  if (filter.training) {
    parts.push(i18n.t('filter.training'));
  }
  return parts.join(' · ');
}

/** Why nothing is shown: what the owner can do about it, in a sentence. */
export function emptyReason(filter: WalkFilter, pending: number, i18n: I18n): string {
  if (countConditions(filter) === 0) {
    return i18n.t('walks.emptyText');
  }
  return pending > 0 ? i18n.t('filter.empty.pending', { n: pending }) : i18n.t('filter.empty.none');
}

export interface FilterTag {
  readonly key: string;
  readonly label: string;
  /** The filter with this one condition taken off. */
  readonly without: WalkFilter;
}

/** Each condition as a tag that can be taken off with one tap. */
export function activeTags(
  filter: WalkFilter,
  options: FilterOptions,
  typeLabel: (typeId: string) => string,
  i18n: I18n,
): FilterTag[] {
  const tags: FilterTag[] = [];
  if (filter.days !== null) {
    tags.push({
      key: 'days',
      label: periodLabel(filter.days, i18n),
      without: { ...filter, days: null },
    });
  }
  const names = new Map(options.places.map((p) => [p.id, p.name]));
  for (const id of filter.placeIds) {
    tags.push({
      key: `place-${id}`,
      label: names.get(id) ?? '…',
      without: { ...filter, placeIds: filter.placeIds.filter((x) => x !== id) },
    });
  }
  for (const [dimension, values] of Object.entries(filter.dims)) {
    for (const value of values) {
      tags.push({
        key: `${dimension}-${value}`,
        label: valueLabel(i18n, dimension, value),
        without: {
          ...filter,
          dims: { ...filter.dims, [dimension]: values.filter((x) => x !== value) },
        },
      });
    }
  }
  for (const type of filter.eventTypes) {
    tags.push({
      key: `event-${type}`,
      label: typeLabel(type),
      without: { ...filter, eventTypes: filter.eventTypes.filter((x) => x !== type) },
    });
  }
  for (const outcome of filter.outcomes) {
    tags.push({
      key: `outcome-${outcome}`,
      label: outcomeLabel(outcome, i18n),
      without: { ...filter, outcomes: filter.outcomes.filter((x) => x !== outcome) },
    });
  }
  if (filter.training) {
    tags.push({
      key: 'training',
      label: i18n.t('filter.training'),
      without: { ...filter, training: false },
    });
  }
  return tags;
}

export interface QuickStart {
  readonly key: string;
  readonly label: string;
  readonly apply: (filter: WalkFilter) => WalkFilter;
}

/** Ready-made starting points: a tap puts the condition on, whatever else is set. */
export function quickStarts(i18n: I18n): QuickStart[] {
  return [
    {
      key: 'hard',
      label: i18n.t('filter.quick.hard'),
      apply: (f) => ({ ...f, outcomes: ['hard_moment'] }),
    },
    {
      key: 'wet',
      label: i18n.t('filter.quick.wet'),
      apply: (f) => withDimension(f, 'ground', 'wet'),
    },
    {
      key: 'dark',
      label: i18n.t('filter.quick.dark'),
      apply: (f) => withDimension(f, 'light', 'dark'),
    },
    { key: 'month', label: i18n.t('filter.quick.month'), apply: (f) => ({ ...f, days: 30 }) },
    {
      key: 'training',
      label: i18n.t('filter.quick.training'),
      apply: (f) => ({ ...f, training: true }),
    },
  ];
}
