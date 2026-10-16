import type { WalkPatterns } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import type { CheckedCard, Facts, PreliminaryCard } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { buildInsights, dimensionLabel, factRows, valueLabel } from './insightsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 16, 9);
const DAY = 86_400_000;

const interval = null;
const card = (extra: Partial<CheckedCard> = {}): CheckedCard => ({
  key: 'ground|wet|hard_moment',
  dimension: 'ground',
  value: 'wet',
  outcome: 'hard_moment',
  inCondition: { k: 7, n: 8, interval },
  rest: { k: 1, n: 8, interval },
  delta: 0.75,
  label: 'noticeable',
  reliability: 'ok',
  testedCount: 61,
  adjustment: { status: 'holds', adjustedDelta: 0.7 },
  ...extra,
});

const health = { walks: 40, current: 40, stale: 0, errors: 0 };
const patterns = (extra: Partial<WalkPatterns> = {}): WalkPatterns => ({
  cards: [],
  explained: [],
  preliminary: [],
  unitCount: 40,
  health,
  ...extra,
});

const noFacts: Facts = {
  totals: { walks: 0, durationS: 0, distanceM: 0, firstAt: null, lastAt: null },
  favouritePlaces: null,
  favouriteTimeOfDay: null,
  favouriteWeekdays: null,
  longestWalk: null,
  farthestWalk: null,
  longestCalm: null,
  busiestWeek: null,
  streak: null,
};

const sources = {
  placeName: (id: string) => ({ p1: 'Парк', p2: 'Двор' })[id as 'p1' | 'p2'],
  startOf: (id: string) => (id === 'w1' ? NOW - 3 * DAY : id === 'w2' ? NOW - 10 * DAY : undefined),
};

describe('labels', () => {
  it('every dimension and value of the catalog has words in both languages', () => {
    for (const [dim, value] of [
      ['ground', 'wet'],
      ['temp', 'below_-10'],
      ['temp', '-10_0'],
      ['place_kind', 'errands'],
      ['walk_type', 'base_to_base'],
      ['rain_recency', 'within_3h'],
    ] as const) {
      expect(dimensionLabel(ru, dim)).not.toBe(dim);
      expect(valueLabel(ru, dim, value)).not.toBe(value);
      expect(dimensionLabel(en, dim)).not.toBe(dim);
      expect(valueLabel(en, dim, value)).not.toBe(valueLabel(ru, dim, value));
    }
  });

  it('an unknown name is shown as it is rather than breaking the screen', () => {
    expect(dimensionLabel(ru, 'strange')).toBe('strange');
    expect(valueLabel(ru, 'ground', 'lava')).toBe('lava');
  });
});

describe('cards', () => {
  it('a finding has a title, the counts in words, a label, the number of checks and what the check said', () => {
    const model = buildInsights(
      { patterns: patterns({ cards: [card()] }), facts: noFacts, ...sources, now: NOW },
      ru,
    );
    expect(model.cards[0]).toMatchObject({
      key: 'ground|wet|hard_moment',
      title: 'Земля: мокро',
      body: 'Сложные моменты были в 7 из 8 прогулок, в остальных в 1 из 8.',
      label: 'Заметная разница',
      found: 'Найдено среди 61 проверенных сравнений',
      note: 'Проверено с учётом места, времени и погоды: ими не объясняется.',
    });
  });

  it('an unchecked card says that it was not checked', () => {
    const model = buildInsights(
      {
        patterns: patterns({
          cards: [card({ adjustment: { status: 'unchecked', adjustedDelta: null } })],
        }),
        facts: noFacts,
        ...sources,
        now: NOW,
      },
      ru,
    );
    expect(model.cards[0]?.note).toContain('Пока не проверено');
  });

  it('what something else explains is named by that something', () => {
    const explained = card({
      adjustment: { status: 'confounded', by: 'place_kind', adjustedDelta: 0.05 },
    });
    const model = buildInsights(
      { patterns: patterns({ explained: [explained] }), facts: noFacts, ...sources, now: NOW },
      ru,
    );
    expect(model.explained[0]?.note).toBe('Скорее всего дело в этом: Тип места.');
    expect(model.explainedHint.length).toBeGreaterThan(10);
  });

  it('observations are not findings: no label, no count of checks, and the warning says how often they are flukes', () => {
    const observed = {
      ...card({ label: 'unclear', testedCount: 80 }),
      preliminary: true,
    } as PreliminaryCard;
    const model = buildInsights(
      {
        patterns: patterns({ unitCount: 30, preliminary: [observed] }),
        facts: noFacts,
        ...sources,
        now: NOW,
      },
      ru,
    );
    expect(model.prelim[0]).toMatchObject({ label: null, found: null });
    expect(model.prelimWarning).toContain('30 случаях из 100');
    expect(
      buildInsights({ patterns: patterns(), facts: noFacts, ...sources, now: NOW }, ru)
        .prelimWarning,
    ).toBeNull();
  });

  it('in English too', () => {
    const model = buildInsights(
      { patterns: patterns({ cards: [card()] }), facts: noFacts, ...sources, now: NOW },
      en,
    );
    expect(model.cards[0]?.body).toBe(
      'Hard moments happened in 7 of 8 walks, in the others in 1 of 8.',
    );
  });
});

describe('the state of the screen', () => {
  it('few walks and nothing found: what is missing, not an empty chart', () => {
    const model = buildInsights(
      {
        patterns: patterns({ unitCount: 6, health: { walks: 6, current: 6, stale: 0, errors: 0 } }),
        facts: noFacts,
        ...sources,
        now: NOW,
      },
      ru,
    );
    expect(model.empty?.text).toBe(
      'Для первых наблюдений нужно хотя бы 15 прогулок с записанными событиями или законченным итогом: сейчас 6.',
    );
    expect(model.noCards).toBeNull();
  });

  it('enough walks and nothing found says so calmly', () => {
    const model = buildInsights({ patterns: patterns(), facts: noFacts, ...sources, now: NOW }, ru);
    expect(model.empty).toBeNull();
    expect(model.noCards).toContain('не называет');
  });

  it('while the numbers are being worked out the status says how far it got', () => {
    const counting = buildInsights(
      {
        patterns: patterns({ health: { walks: 12, current: 7, stale: 5, errors: 0 } }),
        facts: noFacts,
        ...sources,
        now: NOW,
      },
      ru,
    );
    expect(counting.counting).toBe(true);
    expect(counting.status).toBe('Пока считаю… 7 из 12 прогулок');
    expect(
      buildInsights({ patterns: patterns(), facts: noFacts, ...sources, now: NOW }, ru),
    ).toMatchObject({
      counting: false,
      status: 'Посчитано: 40 прогулок',
    });
  });
});

describe('facts', () => {
  const facts: Facts = {
    totals: {
      walks: 12,
      durationS: 21_600,
      distanceM: 30_000,
      firstAt: NOW - 30 * DAY,
      lastAt: NOW,
    },
    favouritePlaces: { values: ['p1'], count: 6, of: 10 },
    favouriteTimeOfDay: { values: ['morning', 'evening'], count: 5, of: 12 },
    favouriteWeekdays: { values: [5], count: 3, of: 12 },
    longestWalk: { walkIds: ['w1', 'w2'], value: 5400 },
    farthestWalk: { walkIds: ['w2'], value: 7300 },
    longestCalm: { walkIds: ['w1'], value: 1_800_000 },
    busiestWeek: { weekStartDay: Math.floor((NOW - 7 * DAY) / DAY) - 2, walks: 5, tied: 2 },
    streak: { best: 4, current: 2 },
  };

  it('are rows with a label and a value, in a fixed order', () => {
    const rows = factRows(facts, sources, ru, NOW);
    expect(rows.map((r) => r.key)).toEqual([
      'totals',
      'place',
      'time',
      'weekday',
      'longest',
      'farthest',
      'calm',
      'week',
      'streak',
    ]);
    const by = (key: string) => rows.find((r) => r.key === key)?.value;
    expect(by('totals')).toBe('12 прогулок · 30 км · 6 ч 00 мин');
    expect(by('place')).toBe('Парк (6 из 10)');
    expect(by('weekday')).toBe('суббота (3 из 12)');
    expect(by('streak')).toBe('лучшая серия 4, сейчас 2');
  });

  it('a tie is told as a tie, never one picked', () => {
    const rows = factRows(facts, sources, ru, NOW);
    expect(rows.find((r) => r.key === 'time')?.value).toBe('поровну: утром, вечером (5 из 12)');
    expect(rows.find((r) => r.key === 'longest')?.value).toContain('и ещё 1 с тем же результатом');
    expect(rows.find((r) => r.key === 'week')?.value).toContain('и ещё 1');
  });

  it('a favourite place that has gone is left out, and no facts give no rows', () => {
    const rows = factRows(
      { ...facts, favouritePlaces: { values: ['gone'], count: 6, of: 10 } },
      sources,
      ru,
      NOW,
    );
    expect(rows.find((r) => r.key === 'place')).toBeUndefined();
    expect(factRows(noFacts, sources, ru, NOW)).toEqual([]);
  });

  it('a record whose walk is unknown still has its number', () => {
    const rows = factRows(
      { ...facts, farthestWalk: { walkIds: ['x'], value: 7300 } },
      sources,
      ru,
      NOW,
    );
    expect(rows.find((r) => r.key === 'farthest')?.value).toMatch(/^7,3 км, $/);
  });

  it('the screen carries the facts after the status', () => {
    const model = buildInsights({ patterns: patterns(), facts, ...sources, now: NOW }, ru);
    expect(model.facts.length).toBe(9);
  });
});
