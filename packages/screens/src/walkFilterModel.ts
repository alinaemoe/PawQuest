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
