import type { HealthOverview } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { localDay } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { healthStatsModel } from './healthStatsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 9);
const today = localDay(NOW, 180);

const overview = (over: Partial<HealthOverview> = {}): HealthOverview => ({
  weight: { latest: { at: NOW, grams: 6150 }, change30: 150, change90: -50 },
  weights: [
    { at: NOW - 60 * DAY, grams: 6000 },
    { at: NOW, grams: 6150 },
  ],
  weeks: [
    { mondayDay: today - 11, walks: 2, durationS: 3600, wetDurationS: 0 },
    { mondayDay: today - 4, walks: 4, durationS: 7200, wetDurationS: 0 },
  ],
  unusual: [{ id: 'w', startedAt: NOW - DAY, durationS: 240, kind: 'short', usualS: 1860 }],
  persistent: null,
  busy: [{ day: today - 3, load: 12, percentile: 95 }],
  ...over,
});

describe('healthStatsModel', () => {
  it('the weight with signed changes, the weeks, the unusual walk and the busy day in words', () => {
    const model = healthStatsModel(overview(), today, NOW, ru);
    expect(model.weight?.value).toBe('6,2 кг');
    expect(model.weight?.lines).toEqual(['Месяц назад: +150 г', 'Три месяца назад: −50 г']);
    expect(model.weight?.bars).toHaveLength(2);
    expect(model.weight?.bars[0]?.end).toBeCloseTo(6000 / 6150, 10);
    expect(model.activity.bars.map((b) => b.end)).toEqual([0.5, 1]);
    expect(model.unusual.lines[0]).toBe('15 окт: 4 мин, обычно 31 мин. Короче обычного.');
    expect(model.unusual.note).toBeNull();
    expect(model.busy).toEqual(['13 окт']);
  });

  it('the note about the vet only when the change stays; no weight is a hint, not a gap', () => {
    const model = healthStatsModel(
      overview({ persistent: 'short', weight: null, weights: [] }),
      today,
      NOW,
      ru,
    );
    expect(model.unusual.note).toBe('Если изменение сохраняется, стоит обсудить с ветеринаром.');
    expect(model.weight).toBeNull();
  });

  it('a change of nothing, big changes in kilograms, no walks and no busy days', () => {
    const model = healthStatsModel(
      overview({
        weight: { latest: { at: NOW, grams: 6000 }, change30: 0, change90: 1500 },
        weeks: [{ mondayDay: today, walks: 0, durationS: 0, wetDurationS: 0 }],
        unusual: [],
        busy: [],
      }),
      today,
      NOW,
      ru,
    );
    expect(model.weight?.lines).toEqual([
      'Месяц назад: без изменений',
      'Три месяца назад: +1,5 кг',
    ]);
    expect(model.activity.bars).toEqual([]);
    expect(model.unusual.lines).toEqual([]);
    expect(model.busy).toEqual([]);
  });

  it('a long walk is told as longer; weights with no earlier entry have no lines', () => {
    const model = healthStatsModel(
      overview({
        unusual: [{ id: 'w', startedAt: NOW, durationS: 9000, kind: 'long', usualS: 1800 }],
        weight: { latest: { at: NOW, grams: 6000 }, change30: null, change90: null },
      }),
      today,
      NOW,
      ru,
    );
    expect(model.unusual.lines[0]).toContain('Дольше обычного');
    expect(model.weight?.lines).toEqual([]);
  });
});
