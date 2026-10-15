import { nameKey, type InferredCategory } from '@pawquest/core';
import { PLACE_CATEGORIES, type Place, type PlaceCategory, type PlaceStats } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

const CATEGORY_KEYS: Readonly<Record<PlaceCategory, MessageKey>> = {
  park: 'place.park',
  meadow: 'place.meadow',
  yard: 'place.yard',
  district: 'place.district',
  forest: 'place.forest',
  waterfront: 'place.waterfront',
  dog_area: 'place.dogArea',
  quiet_street: 'place.quietStreet',
  busy_street: 'place.busyStreet',
  vet: 'place.vet',
  other: 'place.other',
};

export function categoryLabel(category: PlaceCategory, i18n: I18n): string {
  return i18n.t(CATEGORY_KEYS[category]);
}

/** A name that mentions "улица" gives a street; the owner can still pick quiet or busy. */
export function categoryFromGuess(guess: InferredCategory): PlaceCategory {
  return guess === 'street' ? 'quiet_street' : guess;
}

export interface PlaceRowModel {
  readonly id: string;
  readonly name: string;
  readonly category: PlaceCategory;
  /** "12 визитов · последний вчера" */
  readonly subtitle: string;
}

export function placeRow(place: PlaceStats, i18n: I18n, now: number): PlaceRowModel {
  const visits =
    place.visits === 0 ? i18n.t('places.noVisits') : i18n.t('places.visits', { n: place.visits });
  const subtitle =
    place.lastVisitAt === null
      ? visits
      : `${visits} · ${i18n.t('places.last', { ago: i18n.formatAgo(place.lastVisitAt, now) })}`;
  return { id: place.id, name: place.name, category: place.category, subtitle };
}

export interface PlaceGroup {
  readonly category: PlaceCategory;
  readonly label: string;
  readonly rows: readonly PlaceRowModel[];
}

/** Rows grouped by type in the order of the type list; empty groups are left out. */
export function groupPlaces(rows: readonly PlaceRowModel[], i18n: I18n): PlaceGroup[] {
  return PLACE_CATEGORIES.flatMap((category) => {
    const inGroup = rows.filter((r) => r.category === category);
    return inGroup.length === 0
      ? []
      : [{ category, label: categoryLabel(category, i18n), rows: inGroup }];
  });
}

/** Search by any part of the name, ignoring case, spacing and punctuation. */
export function filterPlaces(
  rows: readonly PlaceRowModel[],
  query: string,
): readonly PlaceRowModel[] {
  const wanted = query.trim().toLowerCase().replace(/ё/g, 'е');
  if (wanted === '') {
    return rows;
  }
  const wantedKey = nameKey(query);
  return rows.filter(
    (r) =>
      r.name.toLowerCase().replace(/ё/g, 'е').includes(wanted) ||
      (wantedKey !== '' && nameKey(r.name).includes(wantedKey)),
  );
}

/** Adds a qualifier chip ("у дома") to what is typed, or to the type's name when nothing is typed. */
export function withQualifier(typed: string, typeLabel: string, qualifier: string): string {
  const base = typed.trim() === '' ? typeLabel : typed.trim();
  return base.toLowerCase().includes(qualifier.toLowerCase()) ? base : `${base} ${qualifier}`;
}

export interface TidyPairModel {
  readonly key: string;
  readonly keepId: string;
  readonly otherId: string;
  readonly text: string;
}

export function tidyPair(pair: { keep: Place; other: Place }, i18n: I18n): TidyPairModel {
  return {
    key: `${pair.keep.id}|${pair.other.id}`,
    keepId: pair.keep.id,
    otherId: pair.other.id,
    text: i18n.t('places.similar', { a: pair.keep.name, b: pair.other.name }),
  };
}
