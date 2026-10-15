import { describe, expect, it } from 'vitest';

import { createI18n } from './i18n';

const NBSP = ' ';
const MINSK = (): number => 180;
const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: MINSK });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: MINSK });
const enImp = createI18n({ locale: 'en', units: 'imperial', tzOffsetMin: MINSK });
const ruImp = createI18n({ locale: 'ru', units: 'imperial', tzOffsetMin: MINSK });

// 15 Oct 2026, 14:05 in Minsk (UTC+3) = 11:05 UTC
const NOW = Date.UTC(2026, 9, 15, 11, 5);
const minutes = (n: number): number => n * 60_000;
const hours = (n: number): number => n * 3_600_000;
const days = (n: number): number => n * 86_400_000;

describe('t', () => {
  it('translates and picks plural forms', () => {
    expect(ru.t('common.save')).toBe('Сохранить');
    expect(en.t('common.save')).toBe('Save');
    expect(ru.t('time.daysAgo', { n: 1 })).toBe('1 день назад');
    expect(ru.t('time.daysAgo', { n: 3 })).toBe('3 дня назад');
    expect(ru.t('time.daysAgo', { n: 5 })).toBe('5 дней назад');
    expect(ru.t('time.daysAgo', { n: 21 })).toBe('21 день назад');
    expect(ru.t('time.daysAgo', { n: 1.5 })).toBe('1.5 дня назад');
    expect(en.t('time.daysAgo', { n: 1 })).toBe('1 day ago');
    expect(en.t('time.daysAgo', { n: 2 })).toBe('2 days ago');
  });

  it('a plural message without a numeric n uses the other form', () => {
    expect(en.t('time.daysAgo', { n: 'many' })).toBe('many days ago');
    expect(en.t('time.daysAgo')).toBe('{n} days ago');
  });
});

describe('formatDistance', () => {
  it('metric: meters below a kilometer, kilometers above', () => {
    expect(ru.formatDistance(0)).toBe('0 м');
    expect(ru.formatDistance(850)).toBe('850 м');
    expect(ru.formatDistance(999.4)).toBe('999 м');
    expect(ru.formatDistance(1000)).toBe('1 км');
    expect(ru.formatDistance(1840)).toBe('1,84 км');
    expect(en.formatDistance(1840)).toBe('1.84 km');
    expect(ru.formatDistance(12_345)).toBe('12,3 км');
  });

  it('imperial: feet below 1000 ft, miles above', () => {
    expect(enImp.formatDistance(100)).toBe('328 ft');
    expect(enImp.formatDistance(1609.344)).toBe('1 mi');
    expect(enImp.formatDistance(5000)).toBe('3.11 mi');
    expect(ruImp.formatDistance(5000)).toBe('3,11 ми');
  });
});

describe('formatDuration and formatClock', () => {
  it('seconds, minutes, hours', () => {
    expect(ru.formatDuration(0)).toBe('0 с');
    expect(ru.formatDuration(45)).toBe('45 с');
    expect(ru.formatDuration(59.6)).toBe('1 мин');
    expect(ru.formatDuration(60)).toBe('1 мин');
    expect(ru.formatDuration(32 * 60)).toBe('32 мин');
    expect(ru.formatDuration(3600)).toBe('1 ч 00 мин');
    expect(ru.formatDuration(3600 + 5 * 60)).toBe('1 ч 05 мин');
    expect(en.formatDuration(3600 + 5 * 60)).toBe('1 h 05 min');
    expect(ru.formatDuration(-5)).toBe('0 с');
  });

  it('clock has fixed width', () => {
    expect(ru.formatClock(0)).toBe('00:00:00');
    expect(ru.formatClock(754)).toBe('00:12:34');
    expect(ru.formatClock(3 * 3600 + 7 * 60 + 9.9)).toBe('03:07:09');
    expect(ru.formatClock(-3)).toBe('00:00:00');
  });
});

describe('formatPace', () => {
  it('shows minutes:seconds per km or per mile', () => {
    expect(ru.formatPace(12.5)).toBe('12:30 /км');
    expect(en.formatPace(12.5)).toBe('12:30 /km');
    expect(enImp.formatPace(10)).toBe('16:06 /mi');
  });
  it('unknown pace is a dash', () => {
    expect(ru.formatPace(null)).toBe('—');
    expect(ru.formatPace(0)).toBe('—');
    expect(ru.formatPace(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatWeight', () => {
  it('kg with one decimal, pounds for imperial', () => {
    expect(ru.formatWeight(6200)).toBe('6,2 кг');
    expect(ru.formatWeight(6000)).toBe('6 кг');
    expect(en.formatWeight(6240)).toBe('6.2 kg');
    expect(enImp.formatWeight(6200)).toBe('13.7 lb');
    expect(ru.formatWeight(12_500)).toBe('12,5 кг');
    expect(ru.formatWeight(1_250_000)).toBe(`1${NBSP}250 кг`);
  });
});

describe('time and date', () => {
  it('formats the time in 24 hours in the local zone', () => {
    expect(ru.formatTime(NOW)).toBe('14:05');
    expect(ru.formatTime(Date.UTC(2026, 9, 15, 21, 30))).toBe('00:30');
  });

  it('formats dates, with the year only when it differs', () => {
    expect(ru.formatDate(NOW - days(3), NOW)).toBe('12 окт');
    expect(en.formatDate(NOW - days(3), NOW)).toBe('Oct 12');
    expect(ru.formatDate(Date.UTC(2025, 11, 31, 12), NOW)).toBe('31 дек 2025');
  });

  it('formatDay: today, yesterday, then a date', () => {
    expect(ru.formatDay(NOW, NOW)).toBe('сегодня');
    expect(ru.formatDay(NOW - hours(15), NOW)).toBe('вчера'); // 23:05 the day before in Minsk
    expect(ru.formatDay(NOW - days(2), NOW)).toBe('13 окт');
    expect(en.formatDay(NOW - days(1), NOW)).toBe('yesterday');
  });

  it('the calendar day follows the local zone, not 24-hour distance', () => {
    // 23:50 Minsk the day before is "yesterday" although only 15 minutes passed before 00:05
    const justAfterMidnight = Date.UTC(2026, 9, 14, 21, 5); // 15 Oct 00:05 Minsk
    const before = justAfterMidnight - minutes(15); // 14 Oct 23:50 Minsk
    expect(ru.formatDay(before, justAfterMidnight)).toBe('вчера');
    expect(ru.formatAgo(before, justAfterMidnight)).toBe('вчера');
  });
});

describe('formatAgo', () => {
  it('same day: just now, minutes, hours', () => {
    expect(ru.formatAgo(NOW - 20_000, NOW)).toBe('только что');
    expect(ru.formatAgo(NOW - minutes(1), NOW)).toBe('1 минуту назад');
    expect(ru.formatAgo(NOW - minutes(12), NOW)).toBe('12 минут назад');
    expect(ru.formatAgo(NOW - hours(4), NOW)).toBe('4 часа назад');
    expect(en.formatAgo(NOW - hours(1), NOW)).toBe('1 hour ago');
    expect(en.formatAgo(NOW - minutes(2), NOW)).toBe('2 minutes ago');
  });

  it('earlier days: yesterday, N days ago, then the date', () => {
    expect(ru.formatAgo(NOW - days(1), NOW)).toBe('вчера');
    expect(ru.formatAgo(NOW - days(3), NOW)).toBe('3 дня назад');
    expect(ru.formatAgo(NOW - days(6), NOW)).toBe('6 дней назад');
    expect(ru.formatAgo(NOW - days(7), NOW)).toBe('8 окт');
    expect(en.formatAgo(NOW - days(40), NOW)).toBe('Sep 5');
  });

  it('the future is shown as a date', () => {
    expect(ru.formatAgo(NOW + days(2), NOW)).toBe('17 окт');
    expect(ru.formatAgo(NOW + minutes(5), NOW)).toBe('15 окт');
  });
});

describe('default time zone', () => {
  it('falls back to the device zone offset', () => {
    const device = createI18n({ locale: 'en', units: 'metric' });
    const ts = Date.UTC(2026, 9, 15, 11, 5);
    expect(device.formatTime(ts)).toMatch(/^\d{2}:\d{2}$/);
  });
});
