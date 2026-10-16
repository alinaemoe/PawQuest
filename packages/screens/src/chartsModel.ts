import type { ChartData, PeriodComparison } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { valueLabel } from './insightsModel';

/** The words and sizes of the period comparison and of the charts (docs/23, step 3.9). */

const DAY_MS = 86_400_000;

export const COMPARE_PRESETS = [7, 14, 30] as const;

export interface CompareRowModel {
  readonly key: string;
  readonly title: string;
  readonly a: string;
  readonly b: string;
  /** What is told about the difference: a plain change for totals, an honest label for the rest. */
  readonly note: string | null;
  /** The difference is worth the eye (a "noticeable" or "possible" label). */
  readonly strong: boolean;
}

export interface CompareModel {
  readonly headerA: string;
  readonly headerB: string;
  readonly rows: readonly CompareRowModel[];
  /** Both periods are empty: say so instead of a table of zeros. */
  readonly empty: boolean;
  readonly caveat: string;
}

const percent = (share: number | null): string =>
  share === null ? '—' : `${String(Math.round(share * 100))}%`;

function signed(value: number, format: (v: number) => string): string {
  if (value === 0) {
    return format(0);
  }
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

export function compareModel(comparison: PeriodComparison, days: number, i18n: I18n): CompareModel {
  const count = (n: number): string => String(n);
  const formats: Record<string, (v: number) => string> = {
    walks: count,
    time: (v) => (v === 0 ? '—' : i18n.formatDuration(v)),
    distance: (v) => (v === 0 ? '—' : i18n.formatDistance(v)),
    typicalWalk: (v) => i18n.formatDuration(v),
  };
  const rows = comparison.rows.map((row): CompareRowModel => {
    const title = i18n.t(`compare.row.${row.key}` as MessageKey);
    const isShare = row.key === 'hard' || row.key === 'success';
    const format = formats[row.key];
    const show = (value: number | null, n: number): string => {
      if (value === null) {
        return '—';
      }
      return isShare ? `${percent(value)} (${String(n)})` : (format?.(value) ?? String(value));
    };
    const a = show(row.a, row.nA);
    const b = show(row.b, row.nB);
    if (row.label === null) {
      const note =
        row.diff === null || format === undefined || row.diff === 0
          ? null
          : signed(row.diff, format);
      return { key: row.key, title, a, b, note, strong: false };
    }
    return {
      key: row.key,
      title,
      a,
      b,
      note: i18n.t(`insights.label.${row.label}` as MessageKey),
      strong: row.label === 'noticeable' || row.label === 'possible',
    };
  });
  return {
    headerA: i18n.t('compare.last'),
    headerB: i18n.t('compare.before'),
    rows,
    empty: comparison.rows.some((r) => r.key === 'walks' && r.a === 0 && r.b === 0),
    caveat: i18n.t('compare.caveat', { n: days }),
  };
}

export interface BarModel {
  readonly key: string;
  readonly label: string;
  /** Where the bar ends, 0..1 of the full scale. */
  readonly end: number;
  /** The part of the bar to paint in the second colour (wet ground), 0..1 of the full scale. */
  readonly part?: number;
  /** The whisker: the middle half or the interval, 0..1 of the full scale. */
  readonly whisker?: { readonly from: number; readonly to: number };
  /** Few walks behind the bar: it is drawn faded. */
  readonly faded: boolean;
  readonly value: string;
  /** The screen-reader text of the bar. */
  readonly spoken: string;
}

export interface ChartModel {
  readonly key: 'weeks' | 'temp' | 'place';
  readonly title: string;
  readonly hint: string;
  readonly bars: readonly BarModel[];
  readonly empty: string;
}

const scaled = (value: number, max: number): number => (max <= 0 ? 0 : Math.min(1, value / max));

export function chartModels(data: ChartData, today: number, i18n: I18n): ChartModel[] {
  const noon = (day: number): number => day * DAY_MS + 12 * 3_600_000;
  // weeks before the first walk are not drawn (but at least the last four are)
  const first = data.weeks.findIndex((w) => w.durationS > 0);
  const shown = data.weeks.slice(
    first < 0 ? 0 : Math.min(first, Math.max(0, data.weeks.length - 4)),
  );
  const maxWeek = Math.max(0, ...shown.map((w) => w.durationS));
  const weeks: ChartModel = {
    key: 'weeks',
    title: i18n.t('charts.weeks.title'),
    hint: i18n.t('charts.weeks.hint'),
    empty: i18n.t('charts.empty'),
    bars:
      maxWeek === 0
        ? []
        : shown.map((w) => {
            const label = i18n.formatDate(noon(w.mondayDay), noon(today));
            const value = w.durationS === 0 ? '—' : i18n.formatDuration(w.durationS);
            return {
              key: String(w.mondayDay),
              label,
              end: scaled(w.durationS, maxWeek),
              part: scaled(w.wetDurationS, maxWeek),
              faded: false,
              value,
              spoken: i18n.t('charts.weeks.spoken', {
                week: label,
                walks: i18n.t('walks.count', { n: w.walks }),
                duration: value,
              }),
            };
          }),
  };
  const maxTemp = Math.max(0, ...data.tempBands.map((b) => b.q3));
  const temp: ChartModel = {
    key: 'temp',
    title: i18n.t('charts.temp.title'),
    hint: i18n.t('charts.temp.hint'),
    empty: i18n.t('charts.empty'),
    bars: data.tempBands.map((b) => {
      const label = valueLabel(i18n, 'temp', b.value);
      const value = i18n.formatDuration(b.median);
      return {
        key: b.value,
        label,
        end: scaled(b.median, maxTemp),
        whisker: { from: scaled(b.q1, maxTemp), to: scaled(b.q3, maxTemp) },
        faded: !b.enough,
        value: b.enough ? value : `${value} · ${i18n.t('charts.few')}`,
        spoken: i18n.t('charts.temp.spoken', { band: label, n: b.n, duration: value }),
      };
    }),
  };
  const place: ChartModel = {
    key: 'place',
    title: i18n.t('charts.place.title'),
    hint: i18n.t('charts.place.hint'),
    empty: i18n.t('charts.empty'),
    bars: data.placeKinds.map((b) => {
      const label = valueLabel(i18n, 'place_kind', b.value);
      const share = b.n === 0 ? 0 : b.k / b.n;
      const value = `${percent(share)} (${String(b.k)}/${String(b.n)})`;
      return {
        key: b.value,
        label,
        end: share,
        ...(b.interval === null ? {} : { whisker: { from: b.interval.low, to: b.interval.high } }),
        faded: !b.enough,
        value: b.enough ? value : `${value} · ${i18n.t('charts.few')}`,
        spoken: i18n.t('charts.place.spoken', { kind: label, k: b.k, n: b.n }),
      };
    }),
  };
  return [weeks, temp, place];
}
