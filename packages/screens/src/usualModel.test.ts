import type { UsualMetric, WalkUsual, WeatherUsual } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { usualModel, weatherUsualLine } from './usualModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });

const metric = (
  value: number,
  median: number,
  q1: number,
  q3: number,
  kind: 'shorter' | 'usual' | 'longer',
  diff: number,
): UsualMetric => ({
  value,
  usual: { n: 7, median, q1, q3, min: q1, max: q3 },
  comparison: { kind, diff },
});

const usual = (extra: Partial<WalkUsual> = {}): WalkUsual => ({
  walkId: 'w',
  keys: ['place_kind', 'walk_type'],
  widened: false,
  circleSize: 7,
  duration: metric(2700, 1800, 1500, 2100, 'longer', 900),
  distance: null,
  pace: null,
  triggers: null,
  ...extra,
});

describe('usualModel departed and triggers', () => {
  it('the cards of Replay keep only what departs from the usual; triggers per hour read both ways', () => {
    const model = usualModel(
      usual({
        duration: metric(1900, 1800, 1500, 2100, 'usual', 0),
        triggers: metric(6, 2, 1, 3, 'longer', 4),
      }),
      ru,
    );
    expect(model?.lines).toHaveLength(2);
    expect(model?.departed).toEqual(['Раздражителей в час: 6, чаще обычного (обычно 1–3)']);
    const fewer = usualModel(
      usual({ duration: null, triggers: metric(0, 3, 2, 4, 'shorter', 3) }),
      en,
    );
    expect(fewer?.departed[0]).toContain('fewer than usual');
    expect(
      usualModel(usual({ duration: metric(1900, 1800, 1500, 2100, 'usual', 0) }), ru)?.departed,
    ).toEqual([]);
  });
});

describe('usualModel', () => {
  it('a longer walk: the numbers, the difference and where most of the others lie', () => {
    const model = usualModel(usual(), ru);
    expect(model?.lines).toEqual([
      'Длительность 45 мин: на 15 мин дольше обычного (обычно 25 мин–35 мин)',
    ]);
    expect(model?.caption).toBe('Сравнение: 7 прогулок, тот же тип места и прогулки.');
  });

  it('a walk like the others says "as usual" and does not repeat the range', () => {
    const model = usualModel(usual({ duration: metric(1900, 1800, 1500, 2100, 'usual', 0) }), ru);
    expect(model?.lines).toEqual(['Длительность 32 мин: как обычно']);
  });

  it('distance and pace read the right way round (a longer time per km is slower)', () => {
    const model = usualModel(
      usual({
        duration: null,
        distance: metric(3200, 2000, 1900, 2100, 'longer', 1200),
        pace: metric(16, 14, 13.5, 14.5, 'longer', 2),
      }),
      ru,
    );
    expect(model?.lines).toEqual([
      'Дистанция 3,2 км: на 1,2 км дальше обычного (обычно 1,9 км–2,1 км)',
      'Темп 16:00 /км: на 2 мин на километр медленнее обычного (обычно 13:30 /км–14:30 /км)',
    ]);
    const shorter = usualModel(
      usual({ duration: null, distance: metric(1000, 2000, 1900, 2100, 'shorter', 1000) }),
      ru,
    );
    expect(shorter?.lines[0]).toContain('на 1 км ближе обычного');
    const faster = usualModel(
      usual({ duration: null, pace: metric(12, 14, 13.5, 14.5, 'shorter', 2) }),
      ru,
    );
    expect(faster?.lines[0]).toContain('быстрее обычного');
  });

  it('a wide circle is told: any walks, and that there were few like it', () => {
    const model = usualModel(usual({ keys: [], widened: true, circleSize: 9 }), ru);
    expect(model?.caption).toBe(
      'Сравнение: 9 прогулок, любые ваши прогулки. Похожих прогулок мало, поэтому круг сравнения шире.',
    );
    expect(usualModel(usual({ keys: ['place_kind'] }), ru)?.caption).toContain(
      'такой же тип места',
    );
    expect(usualModel(usual({ keys: ['walk_type'] }), ru)?.caption).toContain(
      'такой же тип прогулки',
    );
  });

  it('nothing to compare, nothing said', () => {
    expect(usualModel(null, ru)).toBeNull();
    expect(usualModel(usual({ duration: null }), ru)).toBeNull();
  });

  it('in English', () => {
    expect(usualModel(usual(), en)?.lines[0]).toBe(
      'Duration 45 min: 15 min longer than usual (usually 25 min–35 min)',
    );
  });
});

describe('weatherUsualLine', () => {
  const weather = (extra: Partial<WeatherUsual> = {}): WeatherUsual => ({
    keys: ['ground', 'temp', 'light'],
    values: { ground: 'wet', temp: '0_10', light: 'day' },
    widened: false,
    circleSize: 7,
    duration: { n: 7, median: 1680, q1: 1500, q3: 1920, min: 1200, max: 2400 },
    ...extra,
  });

  it('the conditions in words, how many walks and how long they usually were', () => {
    expect(weatherUsualLine(weather(), ru)).toBe(
      'В похожую погоду (мокро, от 0° до 10°, день) было 7 прогулок, обычно 28 мин (чаще 25 мин–32 мин).',
    );
  });

  it('a wider circle names fewer conditions', () => {
    expect(weatherUsualLine(weather({ keys: ['ground'], widened: true }), ru)).toContain('(мокро)');
  });

  it('nothing without enough walks or without durations', () => {
    expect(weatherUsualLine(null, ru)).toBeNull();
    expect(weatherUsualLine(weather({ duration: null }), ru)).toBeNull();
  });

  it('in English', () => {
    expect(weatherUsualLine(weather({ keys: ['ground'] }), en)).toBe(
      'In weather like this (wet) there were 7 walks, usually 28 min (most often 25 min–32 min).',
    );
  });
});
