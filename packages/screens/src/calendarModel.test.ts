import type { DayWalk, Memory } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { calendarWeeks, localDay } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { calendarModel, dayRows, memoryModels } from './calendarModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 9); // Friday
const today = localDay(NOW, 180);

describe('calendarModel', () => {
  const walks = [
    { startedAt: Date.UTC(2026, 9, 12, 5), tzOffsetMin: 180, durationS: 1800, distanceM: 2000 },
    { startedAt: Date.UTC(2026, 9, 12, 14), tzOffsetMin: 180, durationS: 1200, distanceM: 1000 },
    { startedAt: Date.UTC(2026, 9, 14, 5), tzOffsetMin: 180, durationS: 6000, distanceM: 6000 },
  ];
  const model = calendarModel(calendarWeeks(walks, today, 2), today, ru);

  it('Monday-first weekday letters and one row per week with the date of its Monday', () => {
    expect(model.weekdays).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
    expect(model.rows.map((r) => r.label)).toEqual(['5 окт', '12 окт']);
    expect(model.rows.every((r) => r.cells.length === 7)).toBe(true);
  });

  it('cells carry the level, the walk count, a reading for the screen reader and today', () => {
    const week = model.rows[1]?.cells ?? [];
    expect(week[0]).toMatchObject({ level: 3, walks: 2, isToday: false });
    expect(week[0]?.label).toBe('12 окт: 2 прогулки, 50 мин');
    expect(week[1]).toMatchObject({ level: 0, walks: 0 });
    expect(week[1]?.label).toBe('13 окт: прогулок нет');
    expect(week[0]?.title).toBe('Понедельник, 12 октября');
    expect(week[2]?.level).toBe(4);
    expect(week[4]?.isToday).toBe(true);
    expect(week[5]).toBeNull(); // Saturday has not come yet
  });

  it('the legend says what colour means, and the English one too', () => {
    expect(model.legend).toContain('время на ногах');
    expect(calendarModel([], today, en).legend).toContain('time on foot');
    expect(calendarModel([], today, en).weekdays[0]).toBe('Mo');
    expect(calendarModel([], today, ru).rows).toEqual([]);
  });
});

describe('dayRows', () => {
  it('the walks of a day as lines; an unknown length is a dash', () => {
    const walks: DayWalk[] = [
      { id: 'a', startedAt: Date.UTC(2026, 9, 12, 7, 41), durationS: 6120, distanceM: 4270 },
      { id: 'b', startedAt: Date.UTC(2026, 9, 12, 15, 0), durationS: null, distanceM: null },
    ];
    expect(dayRows(walks, ru)).toEqual([
      { key: 'a', text: '10:41 · 1 ч 42 мин · 4,27 км' },
      { key: 'b', text: '18:00 · — · —' },
    ]);
    expect(dayRows([], ru)).toEqual([]);
  });
});

describe('memoryModels', () => {
  const memories: Memory[] = [
    {
      yearsAgo: 1,
      walks: [
        { id: 'a', startedAt: NOW - 365 * DAY, durationS: 2400, distanceM: 2000 },
        { id: 'b', startedAt: NOW - 365 * DAY + 3_600_000, durationS: 1800, distanceM: null },
      ],
      photos: [{ id: 'p', uri: 'file:///p.jpg' } as Memory['photos'][number]],
    },
    {
      yearsAgo: 3,
      walks: [],
      photos: [{ id: 'q', uri: 'file:///q.jpg' } as Memory['photos'][number]],
    },
  ];

  it('year by year, walks added up, a year with only pictures has no walks line', () => {
    const models = memoryModels(memories, ru);
    expect(models.map((m) => m.heading)).toEqual(['1 год назад', '3 года назад']);
    expect(models[0]?.walksLine).toBe('2 прогулки, 1 ч 10 мин');
    expect(models[1]?.walksLine).toBeNull();
    expect(models[0]?.photos).toEqual([{ id: 'p', uri: 'file:///p.jpg' }]);
    expect(memoryModels([], ru)).toEqual([]);
  });
});
