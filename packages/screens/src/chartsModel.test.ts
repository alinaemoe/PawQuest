import type { ChartData, PeriodComparison } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { comparePeriods, localDay, wilsonInterval, type PeriodWalk } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { chartModels, compareModel } from './chartsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 16, 9);
const today = localDay(NOW, 180);

const walk = (extra: Partial<PeriodWalk> = {}): PeriodWalk => ({
  startedAt: 0,
  durationS: 1800,
  distanceM: 2000,
  hard: false,
  success: false,
  ...extra,
});
const many = (n: number, extra: (i: number) => Partial<PeriodWalk> = () => ({})): PeriodWalk[] =>
  Array.from({ length: n }, (_, i) => walk(extra(i)));
const comparison = (a: PeriodWalk[], b: PeriodWalk[]): PeriodComparison => ({
  a: { fromTs: 0, toTs: 1 },
  b: { fromTs: 0, toTs: 1 },
  rows: comparePeriods(a, b),
});

describe('compareModel', () => {
  it('totals with a signed change, shares with counts and an honest label', () => {
    const model = compareModel(
      comparison(
        many(10, (i) => ({ hard: i < 7 })),
        many(6, () => ({ durationS: 600, distanceM: 500, hard: false })),
      ),
      14,
      ru,
    );
    expect(model.headerA).toBe('Последние 14 дн.');
    expect(model.headerB).toBe('14 дн. до этого');
    expect(model.empty).toBe(false);
    const row = (key: string) => model.rows.find((r) => r.key === key);
    expect(row('walks')).toMatchObject({ a: '10', b: '6', note: '+4', strong: false });
    expect(row('hard')).toMatchObject({ a: '70% (10)', b: '0% (6)' });
    expect(row('hard')?.note).toMatch(/разница|данных|Неясно/);
  });

  it('no change is no note; unknown is a dash; two empty periods are said to be empty', () => {
    const same = compareModel(comparison(many(5), many(5)), 7, ru);
    expect(same.rows.find((r) => r.key === 'walks')?.note).toBeNull();
    const unknown = compareModel(
      comparison(
        many(5, () => ({ hard: undefined })),
        many(5),
      ),
      7,
      ru,
    );
    expect(unknown.rows.find((r) => r.key === 'hard')?.a).toBe('—');
    expect(compareModel(comparison([], []), 7, ru).empty).toBe(true);
    const less = compareModel(comparison(many(2), many(5)), 7, ru);
    expect(less.rows.find((r) => r.key === 'walks')?.note).toBe('−3');
  });
});

describe('chartModels', () => {
  const data: ChartData = {
    weeks: [
      { mondayDay: today - 11, walks: 2, durationS: 3600, wetDurationS: 1800 },
      { mondayDay: today - 4, walks: 5, durationS: 7200, wetDurationS: 0 },
    ],
    tempBands: [
      { value: '0_10', n: 6, median: 1800, q1: 1200, q3: 2400, enough: true },
      { value: '-10_0', n: 2, median: 900, q1: 800, q3: 1000, enough: false },
    ],
    placeKinds: [
      { value: 'green', k: 3, n: 6, interval: wilsonInterval(3, 6), enough: true },
      { value: 'water', k: 1, n: 2, interval: null, enough: false },
    ],
  };
  const [weeks, temp, place] = chartModels(data, today, ru);

  it('week bars are scaled to the longest week, with the wet part inside', () => {
    expect(weeks?.bars.map((b) => b.end)).toEqual([0.5, 1]);
    expect(weeks?.bars[0]?.part).toBe(0.25);
    expect(weeks?.bars[1]?.spoken).toContain('5 прогулок');
  });

  it('few walks make a faded bar with a note, and the whisker is the middle half', () => {
    expect(temp?.bars[0]).toMatchObject({ label: 'от 0° до 10°', faded: false });
    expect(temp?.bars[0]?.whisker).toEqual({ from: 0.5, to: 1 });
    expect(temp?.bars[1]?.faded).toBe(true);
    expect(temp?.bars[1]?.value).toContain('мало данных');
  });

  it('place bars are shares with the interval as whisker', () => {
    expect(place?.bars[0]).toMatchObject({ label: 'зелёные места', end: 0.5 });
    expect(place?.bars[0]?.value).toBe('50% (3/6)');
    expect(place?.bars[0]?.whisker?.from).toBeLessThan(0.5);
    expect(place?.bars[1]?.whisker).toBeUndefined();
  });

  it('with nothing to draw every chart is empty', () => {
    const empty = chartModels({ weeks: [], tempBands: [], placeKinds: [] }, today, ru);
    expect(empty.map((c) => c.bars.length)).toEqual([0, 0, 0]);
    const zero = chartModels(
      {
        weeks: [{ mondayDay: today, walks: 0, durationS: 0, wetDurationS: 0 }],
        tempBands: [],
        placeKinds: [],
      },
      today,
      ru,
    );
    expect(zero[0]?.bars).toEqual([]);
  });
});
