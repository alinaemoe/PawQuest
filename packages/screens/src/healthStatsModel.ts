import type { HealthOverview } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';

import type { BarModel, ChartModel } from './chartsModel';

/** The words of the "Health and activity" section of Insights (docs/23, step 3.16). Descriptions only. */

const DAY_MS = 86_400_000;
const noon = (day: number): number => day * DAY_MS + 12 * 3_600_000;

export interface HealthStatsModel {
  readonly weight: {
    /** "6,15 кг". */
    readonly value: string;
    /** "Месяц назад: +150 г" and the like; unknown periods are left out. */
    readonly lines: readonly string[];
    readonly bars: readonly BarModel[];
  } | null;
  readonly activity: ChartModel;
  readonly unusual: {
    readonly lines: readonly string[];
    /** The neutral note about the vet, or null. */
    readonly note: string | null;
  };
  readonly busy: readonly string[];
}

function signedGrams(grams: number, i18n: I18n): string {
  const abs = Math.abs(grams);
  const text =
    abs >= 1000 ? i18n.formatWeight(abs) : `${String(Math.round(abs))} ${i18n.t('unit.g')}`;
  return grams === 0 ? i18n.t('health.stats.same') : `${grams > 0 ? '+' : '−'}${text}`;
}

export function healthStatsModel(
  overview: HealthOverview,
  today: number,
  now: number,
  i18n: I18n,
): HealthStatsModel {
  const { weight } = overview;
  const heaviest = Math.max(0, ...overview.weights.map((w) => w.grams));
  const weeksMax = Math.max(0, ...overview.weeks.map((w) => w.durationS));
  return {
    weight:
      weight === null
        ? null
        : {
            value: i18n.formatWeight(weight.latest.grams),
            lines: [
              weight.change30 === null
                ? null
                : i18n.t('health.stats.change30', { change: signedGrams(weight.change30, i18n) }),
              weight.change90 === null
                ? null
                : i18n.t('health.stats.change90', { change: signedGrams(weight.change90, i18n) }),
            ].filter((line) => line !== null),
            bars: overview.weights.map((w): BarModel => {
              const label = i18n.formatDate(w.at, now);
              const value = i18n.formatWeight(w.grams);
              return {
                key: String(w.at),
                label,
                end: heaviest <= 0 ? 0 : w.grams / heaviest,
                faded: false,
                value,
                spoken: i18n.t('health.stats.weightSpoken', { date: label, weight: value }),
              };
            }),
          },
    activity: {
      key: 'activity',
      title: i18n.t('health.stats.activity'),
      hint: i18n.t('health.stats.activityHint'),
      empty: i18n.t('charts.empty'),
      bars:
        weeksMax === 0
          ? []
          : overview.weeks.map((w): BarModel => {
              const label = i18n.formatDate(noon(w.mondayDay), noon(today));
              const value = w.durationS === 0 ? '—' : i18n.formatDuration(w.durationS);
              return {
                key: String(w.mondayDay),
                label,
                end: w.durationS / weeksMax,
                faded: false,
                value,
                spoken: i18n.t('charts.weeks.spoken', {
                  week: label,
                  walks: i18n.t('walks.count', { n: w.walks }),
                  duration: value,
                }),
              };
            }),
    },
    unusual: {
      lines: overview.unusual.map((u) =>
        i18n.t(u.kind === 'short' ? 'health.stats.unusualShort' : 'health.stats.unusualLong', {
          date: i18n.formatDate(u.startedAt, now),
          duration: i18n.formatDuration(u.durationS),
          usual: i18n.formatDuration(u.usualS),
        }),
      ),
      note: overview.persistent === null ? null : i18n.t('health.stats.vetNote'),
    },
    busy: overview.busy.map((b) => i18n.formatDate(noon(b.day), noon(today))),
  };
}
