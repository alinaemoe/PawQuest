import type { ThresholdSeries } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';
import type { RecoverySeries, WeeklySeries } from '@pawquest/insights';

import type { BarModel, ChartModel } from './chartsModel';
import { eventTypeLabel } from './model';

/** The words of the reaction distance and the recovery time (docs/23, step 3.10). */

const DAY_MS = 86_400_000;
const noon = (day: number): number => day * DAY_MS + 12 * 3_600_000;

/** What the series says about its direction, never as a grade. */
function trendLine(series: WeeklySeries, i18n: I18n): string {
  const { label, direction } = series.trend;
  if (label === 'insufficient') {
    return i18n.t('thresholds.trend.insufficient');
  }
  if (label === 'none' || direction === null || direction === 'flat') {
    return i18n.t('thresholds.trend.none');
  }
  return i18n.t(`thresholds.trend.${direction}.${label}` as MessageKey);
}

function bars(
  series: WeeklySeries,
  today: number,
  i18n: I18n,
  format: (value: number) => string,
): BarModel[] {
  const max = Math.max(0, ...series.weeks.map((w) => w.q3));
  const scale = (v: number): number => (max <= 0 ? 0 : Math.min(1, v / max));
  return series.weeks.map((w) => {
    const label = i18n.formatDate(noon(w.mondayDay), noon(today));
    return {
      key: String(w.mondayDay),
      label,
      end: scale(w.median),
      whisker: { from: scale(w.q1), to: scale(w.q3) },
      faded: false,
      value: `${format(w.median)} · ${String(w.n)}`,
      spoken: i18n.t('thresholds.spoken', { week: label, value: format(w.median), n: w.n }),
    };
  });
}

export function thresholdCharts(found: ThresholdSeries, today: number, i18n: I18n): ChartModel[] {
  const distance = found.distances.map(({ type, series }): ChartModel => ({
    key: `distance-${type.id}`,
    title: i18n.t('thresholds.distance.title', {
      trigger: eventTypeLabel(type, type.id, i18n),
    }),
    hint: [
      series.first === null || series.last === null
        ? null
        : i18n.t('thresholds.distance.change', {
            from: Math.round(series.first),
            to: Math.round(series.last),
            n: series.n,
          }),
      trendLine(series, i18n),
      i18n.t('thresholds.distance.how'),
    ]
      .filter((part) => part !== null)
      .join(' '),
    empty: i18n.t('charts.empty'),
    bars: bars(series, today, i18n, (v) => i18n.t('thresholds.metres', { n: Math.round(v) })),
  }));
  const recovery: RecoverySeries = found.recovery;
  const recoveryChart: ChartModel = {
    key: 'recovery',
    title: i18n.t('thresholds.recovery.title'),
    hint: [
      recovery.first === null || recovery.last === null
        ? null
        : i18n.t('thresholds.recovery.change', {
            from: i18n.formatDuration(recovery.first),
            to: i18n.formatDuration(recovery.last),
            n: recovery.n,
          }),
      trendLine(recovery, i18n),
      recovery.missingShare === null || recovery.missingShare === 0
        ? null
        : i18n.t('thresholds.recovery.missing', {
            percent: Math.round(recovery.missingShare * 100),
          }),
    ]
      .filter((part) => part !== null)
      .join(' '),
    empty: i18n.t('thresholds.recovery.empty'),
    bars: bars(recovery, today, i18n, (v) => i18n.formatDuration(v)),
  };
  return recovery.weeks.length === 0 && distance.length === 0 ? [] : [...distance, recoveryChart];
}
