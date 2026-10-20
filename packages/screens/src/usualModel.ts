import type { WalkUsual, WeatherUsual, UsualMetric } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { valueLabel } from './insightsModel';

/** "How it was against the usual" (docs/23, step 3.7): words for the comparison, never a grade. */

export interface UsualModel {
  /** "Длительность 42 мин: на 12 мин дольше обычного (обычно 25–35 мин)". */
  readonly lines: readonly string[];
  /** Only the measures that depart from the usual (for the cards of Replay, A-26); empty: all as usual. */
  readonly departed: readonly string[];
  /** "Сравнение: 7 прогулок, тот же тип места и прогулки." plus a note when the circle is wide. */
  readonly caption: string;
}

function circleWords(keys: readonly string[], i18n: I18n): string {
  const place = keys.includes('place_kind');
  const walk = keys.includes('walk_type');
  const key: MessageKey =
    place && walk
      ? 'usual.circle.both'
      : place
        ? 'usual.circle.place'
        : walk
          ? 'usual.circle.walk'
          : 'usual.circle.any';
  return i18n.t(key);
}

function line(
  labelKey: MessageKey,
  metric: UsualMetric,
  format: (value: number) => string,
  versus: (metric: UsualMetric) => string,
  i18n: I18n,
): string {
  const text = metric.comparison.kind === 'usual' ? i18n.t('usual.same') : versus(metric);
  return i18n.t(labelKey, {
    value: format(metric.value),
    versus:
      metric.comparison.kind === 'usual'
        ? text
        : i18n.t('usual.range', {
            versus: text,
            low: format(metric.usual.q1),
            high: format(metric.usual.q3),
          }),
  });
}

/** The lines and the caption of a walk's comparison; null when there is nothing to say. */
export function usualModel(usual: WalkUsual | null, i18n: I18n): UsualModel | null {
  if (usual === null) {
    return null;
  }
  const lines: string[] = [];
  const departed: string[] = [];
  const note = (metric: UsualMetric, text: string): void => {
    lines.push(text);
    if (metric.comparison.kind !== 'usual') {
      departed.push(text);
    }
  };
  if (usual.duration !== null) {
    note(
      usual.duration,
      line(
        'usual.duration',
        usual.duration,
        (v) => i18n.formatDuration(Math.round(v)),
        (m) =>
          i18n.t(m.comparison.kind === 'longer' ? 'usual.longer' : 'usual.shorter', {
            diff: i18n.formatDuration(Math.round(m.comparison.diff)),
          }),
        i18n,
      ),
    );
  }
  if (usual.distance !== null) {
    note(
      usual.distance,
      line(
        'usual.distance',
        usual.distance,
        (v) => i18n.formatDistance(v),
        (m) =>
          i18n.t(m.comparison.kind === 'longer' ? 'usual.farther' : 'usual.nearer', {
            diff: i18n.formatDistance(m.comparison.diff),
          }),
        i18n,
      ),
    );
  }
  if (usual.pace !== null) {
    note(
      usual.pace,
      line(
        'usual.pace',
        usual.pace,
        (v) => i18n.formatPace(v),
        // a longer time per kilometer is a slower pace
        (m) =>
          i18n.t(m.comparison.kind === 'longer' ? 'usual.slower' : 'usual.faster', {
            diff: i18n.formatDuration(Math.round(m.comparison.diff * 60)),
          }),
        i18n,
      ),
    );
  }
  if (usual.triggers !== null) {
    note(
      usual.triggers,
      line(
        'usual.triggers',
        usual.triggers,
        (v) => i18n.formatNumber(v, 1),
        (m) => i18n.t(m.comparison.kind === 'longer' ? 'usual.moreOften' : 'usual.lessOften'),
        i18n,
      ),
    );
  }
  if (lines.length === 0) {
    return null;
  }
  const caption = i18n.t('usual.caption', {
    count: i18n.t('walks.count', { n: usual.circleSize }),
    circle: circleWords(usual.keys, i18n),
  });
  return {
    lines,
    departed,
    caption: usual.widened ? `${caption} ${i18n.t('usual.widened')}` : caption,
  };
}

/** "В похожую погоду (мокро, от 0° до 10°) было 7 прогулок, обычно 28 мин (чаще 25–32 мин)". */
export function weatherUsualLine(usual: WeatherUsual | null, i18n: I18n): string | null {
  const d = usual?.duration;
  if (usual === null || d === null || d === undefined) {
    return null;
  }
  const conditions = usual.keys
    .map((key) => valueLabel(i18n, key, usual.values[key] ?? ''))
    .filter((word) => word !== '')
    .join(', ');
  return i18n.t('usual.weather', {
    conditions: conditions === '' ? '—' : conditions,
    count: i18n.t('walks.count', { n: usual.circleSize }),
    usual: i18n.t('usual.weatherRange', {
      median: i18n.formatDuration(Math.round(d.median)),
      low: i18n.formatDuration(Math.round(d.q1)),
      high: i18n.formatDuration(Math.round(d.q3)),
    }),
  });
}
