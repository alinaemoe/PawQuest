import { nameKey, ringAreaM2, type InferredCategory } from '@pawquest/core';
import { PLACE_CATEGORIES, type Place, type PlaceCategory, type PlaceStats } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { formatArea } from './contourModel';

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
  square: 'place.square',
  alley: 'place.alley',
  shop: 'place.shop',
  grooming: 'place.grooming',
  home: 'place.home',
  guests: 'place.guests',
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
  readonly radiusM: number;
  /** "12 визитов · последний вчера" */
  readonly subtitle: string;
  /** The place has its own outline from the map or drawn by hand. */
  readonly hasContour: boolean;
  /** "Контур: 33 га" or "Граница: круг 300 м". */
  readonly boundaryLine: string;
}

export function placeRow(place: PlaceStats, i18n: I18n, now: number): PlaceRowModel {
  const visits =
    place.visits === 0 ? i18n.t('places.noVisits') : i18n.t('places.visits', { n: place.visits });
  const subtitle =
    place.lastVisitAt === null
      ? visits
      : `${visits} · ${i18n.t('places.last', { ago: i18n.formatAgo(place.lastVisitAt, now) })}`;
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    radiusM: place.radiusM,
    subtitle,
    hasContour: place.boundary !== null,
    boundaryLine:
      place.boundary === null
        ? i18n.t('contour.noLine', { radius: i18n.formatDistance(place.radiusM) })
        : i18n.t('contour.line', { area: formatArea(ringAreaM2(place.boundary), i18n) }),
  };
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

/** The sizes the owner steps through: from a yard to a big park. */
export const RADIUS_STEPS = [15, 25, 40, 50, 60, 80, 120, 150, 200, 300, 400, 600, 1000] as const;

/** One step smaller (-1) or larger (+1) from the nearest listed size; stays at the ends. */
export function stepRadius(current: number, direction: -1 | 1): number {
  let nearest = 0;
  RADIUS_STEPS.forEach((value, i) => {
    if (Math.abs(value - current) < Math.abs((RADIUS_STEPS[nearest] ?? 0) - current)) {
      nearest = i;
    }
  });
  const next = Math.min(RADIUS_STEPS.length - 1, Math.max(0, nearest + direction));
  return RADIUS_STEPS[next] ?? current;
}
