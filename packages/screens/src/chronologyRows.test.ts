import type { ChronoStep } from '@pawquest/core';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { timelineRows } from './chronologyRows';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const T = Date.UTC(2026, 9, 16, 7, 0, 0); // 10:00 in UTC+3

const visit = (
  fromMin: number,
  minutes: number,
  placeId: string | null,
  gapS = 0,
  indoor = false,
): ChronoStep => ({
  kind: 'visit',
  fromTs: T + fromMin * 60_000,
  toTs: T + (fromMin + minutes) * 60_000,
  durationS: minutes * 60,
  lat: 55,
  lon: 37,
  radiusM: 20,
  placeId,
  scale: 'small',
  gapS,
  innerCount: 0,
  indoor,
});
const leg = (fromMin: number, minutes: number, lengthM: number): ChronoStep => ({
  kind: 'leg',
  fromTs: T + fromMin * 60_000,
  toTs: T + (fromMin + minutes) * 60_000,
  durationS: minutes * 60,
  lengthM,
});

describe('timelineRows', () => {
  const names = new Map([['shop', 'Магазин']]);

  it('words visits by place name and legs by length', () => {
    const rows = timelineRows([leg(0, 6, 480), visit(6, 7, 'shop'), leg(13, 14, 1100)], names, ru);
    expect(rows.map((r) => [r.time, r.kind, r.text, r.detail])).toEqual([
      ['10:00', 'leg', 'Переход', '6 мин · 480 м'],
      ['10:06', 'visit', 'Магазин', '7 мин'],
      ['10:13', 'leg', 'Переход', '14 мин · 1,1 км'],
    ]);
  });

  it('an unnamed visit and a visit to a place that is gone are just a stay', () => {
    const rows = timelineRows([visit(0, 5, null), visit(10, 5, 'gone')], names, ru);
    expect(rows.map((r) => r.text)).toEqual(['Остановка', 'Остановка']);
  });

  it('says so when the signal was lost for a while inside a visit', () => {
    expect(timelineRows([visit(0, 20, 'shop', 600)], names, ru)[0]?.detail).toBe(
      '20 мин · без сигнала',
    );
    expect(timelineRows([visit(0, 20, 'shop', 60)], names, ru)[0]?.detail).toBe('20 мин');
  });

  it('a visit of three minutes or more can be marked, a leg or a short stay cannot', () => {
    const rows = timelineRows([visit(0, 3, null), visit(10, 2, null), leg(20, 5, 300)], names, ru);
    expect(rows.map((r) => r.canMark)).toEqual([true, false, false]);
    expect(rows[0]).toMatchObject({ fromTs: T, toTs: T + 3 * 60_000 });
  });

  it('says so when the time was marked as spent indoors', () => {
    const rows = timelineRows([visit(0, 20, 'shop', 0, true)], names, ru);
    expect(rows[0]).toMatchObject({ indoor: true, detail: '20 мин · внутри' });
  });

  it('keys are unique and nothing gives nothing', () => {
    const rows = timelineRows([visit(0, 5, null), visit(0, 5, null)], names, ru);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
    expect(timelineRows([], names, ru)).toEqual([]);
  });
});
