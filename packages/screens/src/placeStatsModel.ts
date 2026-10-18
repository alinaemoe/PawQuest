import type { PlaceActivity } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';
import { MIN_PLACE_WALKS } from '@pawquest/insights';

import type { BarModel } from './chartsModel';
import { categoryLabel } from './placesModel';

/** The words of the "Places" section of Insights (docs/23, step 3.13). */

const DAY_MS = 86_400_000;
const noon = (day: number): number => day * DAY_MS + 12 * 3_600_000;

export interface StatCardModel {
  readonly id: string;
  readonly title: string;
  /** "6 прогулок · обычно 43 мин". */
  readonly subtitle: string;
  /** "Последний раз 12 окт" or what is missing for a picture. */
  readonly footnote: string;
  readonly enough: boolean;
  /** A soft word under the card ("steady", "not for a while"), or null. */
  readonly note: string | null;
  /** The last weeks, one bar each. */
  readonly bars: readonly BarModel[];
}

export type PlaceCardModel = StatCardModel;

export function placeCards(
  stats: readonly PlaceActivity[],
  today: number,
  now: number,
  i18n: I18n,
): StatCardModel[] {
  return stats.map((place) => {
    const { summary } = place;
    const longest = Math.max(0, ...place.weeks.map((w) => w.medianS ?? 0));
    const typical = summary.medianS === null ? null : i18n.formatDuration(summary.medianS);
    return {
      id: place.placeId,
      title: place.name === '' ? categoryLabel(place.category, i18n) : place.name,
      subtitle: [
        i18n.t('walks.count', { n: summary.walks }),
        typical === null ? null : i18n.t('places.stats.usual', { duration: typical }),
      ]
        .filter((part) => part !== null)
        .join(' · '),
      footnote: summary.enough
        ? i18n.t('places.stats.last', { date: i18n.formatDate(summary.lastAt ?? now, now) })
        : i18n.t('places.stats.few', { n: MIN_PLACE_WALKS - summary.walks }),
      enough: summary.enough,
      note: null,
      bars: place.weeks.map((w): BarModel => {
        const label = i18n.formatDate(noon(w.mondayDay), noon(today));
        const value =
          w.walks === 0
            ? '—'
            : [
                i18n.t('walks.count', { n: w.walks }),
                w.medianS === null ? null : i18n.formatDuration(w.medianS),
              ]
                .filter((part) => part !== null)
                .join(' · ');
        return {
          key: String(w.mondayDay),
          label,
          end: longest <= 0 || w.medianS === null ? 0 : Math.min(1, w.medianS / longest),
          faded: false,
          value,
          spoken: i18n.t('places.stats.spoken', { week: label, value }),
        };
      }),
    };
  });
}
