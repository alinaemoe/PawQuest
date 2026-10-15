import { createI18n } from '@pawquest/i18n';
import type { WeatherFacts } from '@pawquest/weather';
import { describe, expect, it } from 'vitest';

import { weatherLine, weatherView } from './weatherModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });
const AT = Date.UTC(2026, 9, 15, 11, 0); // 14:00 local

const base: WeatherFacts = {
  at: AT,
  gridDistanceKm: 0.2,
  tempC: 12.4,
  apparentC: 12,
  humidityPct: 60,
  windMs: 2,
  gustMs: null,
  code: 3,
  isDay: true,
  rain3hMm: 0,
  rain24hMm: 0,
  rain72hMm: 0,
  snow24hCm: 0,
  raining: false,
  nextRainMin: null,
  lastRainAt: null,
  surfaceTempC: null,
  soilMoisture: null,
  uv: null,
  sunrise: null,
  sunset: null,
  daylightLeftMin: null,
  untilSunriseMin: null,
  aqi: null,
  pm25: null,
  pollen: [],
};
const HOUR = 3_600_000;
const ids = (f: Partial<WeatherFacts>): string[] =>
  weatherView({ ...base, ...f }, ru).chips.map((c) => c.id);

describe('weatherView chips', () => {
  it('a quiet day has only the ground chip', () => {
    const view = weatherView(base, ru);
    expect(view.chips).toEqual([{ id: 'ground', text: 'Сухо', tone: 'plain' }]);
    expect(view.temp).toBe('12°');
    expect(view.feels).toBeNull();
  });

  it('wet ground is flagged and recent rain is worded as a fact', () => {
    const view = weatherView(
      { ...base, rain3hMm: 1, rain24hMm: 4.2, rain72hMm: 5, lastRainAt: AT - 2 * HOUR },
      ru,
    );
    expect(view.chips[0]).toEqual({ id: 'ground', text: 'Мокро, лужи', tone: 'warn' });
    expect(view.chips[1]?.text).toBe('Дождь был 2 часа назад');
  });

  it('wet without puddles, then puddles, then mud', () => {
    const text = (extra: Partial<WeatherFacts>): string | undefined =>
      weatherView({ ...base, ...extra }, ru).chips[0]?.text;
    expect(text({ rain3hMm: 0.4 })).toBe('Мокро');
    expect(text({ rain24hMm: 3 })).toBe('Мокро, лужи');
    expect(text({ rain24hMm: 8 })).toBe('Мокро, лужи и грязь');
    expect(text({ rain24hMm: 8 })).not.toBe(text({ rain24hMm: 3 }));
  });

  it('the rain chip names the strength by the period that matters', () => {
    const chip = (extra: Partial<WeatherFacts>): string | undefined =>
      weatherView({ ...base, ...extra }, ru).chips.find((c) => c.id === 'rain')?.text;
    // within a day the 24 h sum counts; older rain is judged by the 3-day sum
    expect(chip({ lastRainAt: AT - 5 * HOUR, rain24hMm: 0.7, rain72hMm: 0.7 })).toBe(
      'Накрапывало 5 часов назад',
    );
    expect(chip({ lastRainAt: AT - 5 * HOUR, rain24hMm: 2, rain72hMm: 2 })).toBe(
      'Лёгкий дождь 5 часов назад',
    );
    expect(chip({ lastRainAt: AT - 5 * HOUR, rain24hMm: 9, rain72hMm: 9 })).toBe(
      'Ливень был 5 часов назад',
    );
    expect(chip({ lastRainAt: AT - 30 * HOUR, rain24hMm: 0, rain72hMm: 4 })).toBe(
      'Дождь был вчера',
    );
    expect(chip({ lastRainAt: AT - 30 * HOUR, rain24hMm: 0, rain72hMm: 0.3 })).toBeUndefined();
    expect(chip({ lastRainAt: null, rain72hMm: 4 })).toBeUndefined();
  });

  it('rain now beats the nowcast, the nowcast beats the 24 h sum', () => {
    expect(weatherView({ ...base, raining: true, nextRainMin: 5 }, ru).chips[1]?.text).toBe(
      'Идёт дождь',
    );
    expect(weatherView({ ...base, nextRainMin: 25, rain24hMm: 9 }, ru).chips[1]?.text).toBe(
      'Дождь через 25 мин',
    );
    expect(ids({ rain24hMm: 0.4 })).toEqual(['ground']);
  });

  it('daylight: left, until sunrise, or dark', () => {
    expect(weatherView({ ...base, daylightLeftMin: 95 }, ru).chips[1]?.text).toBe(
      'Светло ещё 1 ч 35 мин',
    );
    expect(weatherView({ ...base, isDay: false, untilSunriseMin: 400 }, en).chips[1]?.text).toBe(
      '6 h 40 min until sunrise',
    );
    expect(weatherView({ ...base, isDay: false }, ru).chips[1]?.text).toBe('Темно');
    expect(ids({ isDay: true })).toEqual(['ground']);
  });

  it('hot ground, extreme feels-like, bad air and pollen', () => {
    const view = weatherView(
      {
        ...base,
        surfaceTempC: 47,
        apparentC: 30,
        aqi: 90,
        pollen: [{ species: 'birch', grains: 70 }],
      },
      ru,
    );
    expect(view.chips.map((c) => [c.id, c.tone])).toEqual([
      ['ground', 'plain'],
      ['heat', 'warn'],
      ['comfort', 'warn'],
      ['air', 'warn'],
      ['pollen', 'plain'],
    ]);
    expect(view.chips[4]?.text).toBe('Пыльца: много');
  });

  it('good air shows nothing, moderate air shows plainly', () => {
    expect(ids({ aqi: 15 })).toEqual(['ground']);
    const moderate = weatherView({ ...base, aqi: 50 }, ru).chips[1];
    expect(moderate).toEqual({ id: 'air', text: 'Воздух так себе · 50', tone: 'plain' });
    expect(weatherView({ ...base, aqi: 64 }, ru).chips[1]).toEqual({
      id: 'air',
      text: 'Воздух пыльный · 64',
      tone: 'warn',
    });
  });

  it('feels-like is shown only when it differs by 2 degrees or more', () => {
    expect(weatherView({ ...base, apparentC: 9 }, en).feels).toBe('feels like 9°');
    expect(weatherView({ ...base, apparentC: 11 }, en).feels).toBeNull();
  });
});

describe('weatherView rows and footnote', () => {
  it('lists rain in words with the number, and skips values the model did not give', () => {
    const rows = weatherView(
      { ...base, rain24hMm: 4.2, rain72hMm: 9, lastRainAt: AT - 3 * HOUR },
      ru,
    ).rows;
    expect(rows.map((r) => r.label)).toEqual([
      'Земля',
      'Последний дождь',
      'Осадки за 3 часа',
      'Осадки за сутки',
      'Осадки за 3 суток',
      'Ветер',
    ]);
    expect(rows[1]?.value).toBe('3 часа назад');
    expect(rows[2]?.value).toBe('не было');
    expect(rows[3]?.value).toBe('приличный дождь (4,2 мм)');
    expect(rows[4]?.value).toBe('ливень (9 мм)');
    expect(rows[5]?.value).toBe('2 м/с');
  });

  it('full data: soil, surface, gusts, UV, sun times, air and pollen', () => {
    const rows = weatherView(
      {
        ...base,
        soilMoisture: 0.412,
        surfaceTempC: 8.6,
        gustMs: 7,
        uv: 2.34,
        sunrise: AT - 6 * 3_600_000,
        sunset: AT + 4 * 3_600_000,
        aqi: 31.4,
        pm25: 9.26,
        pollen: [{ species: 'birch', grains: 12 }],
      },
      ru,
    ).rows;
    const by = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(by['Влажность почвы']).toBe('41%');
    expect(by['Температура поверхности']).toBe('9°');
    expect(by['Ветер']).toBe('2 м/с, порывы до 7 м/с');
    expect(by['УФ-индекс']).toBe('2,3');
    expect(by['Рассвет']).toBe('08:00');
    expect(by['Закат']).toBe('18:00');
    expect(by['Воздух (индекс)']).toBe('31 — нормальный');
    expect(by['Мелкая пыль и дым']).toBe('9,3');
    expect(by['Пыльца']).toBe('средне');
  });

  it('pollen row says none when air data exists but no pollen is in the air', () => {
    const by = Object.fromEntries(
      weatherView({ ...base, aqi: 20 }, en).rows.map((r) => [r.label, r.value]),
    );
    expect(by['Pollen']).toBe('none');
  });

  it('explains how to read the air index only when there is one', () => {
    expect(weatherView(base, ru).notes).toEqual([]);
    expect(weatherView({ ...base, aqi: 64 }, ru).notes[0]).toContain('чем меньше, тем чище');
  });

  it('the footnote is honest about the model grid distance', () => {
    expect(weatherView({ ...base, gridDistanceKm: 4.1 }, ru).footnote).toContain('в 4,1 км от вас');
    expect(weatherView(base, en).footnote).toContain('for your spot');
    expect(weatherView(base, ru).updated).toBe('Обновлено 14:00');
  });
});

describe('weatherLine', () => {
  it('joins the temperature and the first three chips', () => {
    const line = weatherLine(
      { ...base, rain3hMm: 1, raining: true, daylightLeftMin: 60, surfaceTempC: 50 },
      ru,
    );
    expect(line).toBe('12° · Мокро, лужи · Идёт дождь · Светло ещё 1 ч 00 мин');
  });
});
