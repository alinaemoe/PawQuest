import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatNumber, localParts, pad2 } from './format';
import { LOCALES } from './locale';

const NBSP = ' ';

describe('formatNumber', () => {
  it('uses the locale decimal separator and trims trailing zeros', () => {
    expect(formatNumber('ru', 1.84, { decimals: 2 })).toBe('1,84');
    expect(formatNumber('en', 1.84, { decimals: 2 })).toBe('1.84');
    expect(formatNumber('ru', 2.5, { decimals: 2 })).toBe('2,5');
    expect(formatNumber('ru', 2, { decimals: 2 })).toBe('2');
  });

  it('keeps trailing zeros when trim is off', () => {
    expect(formatNumber('en', 2.5, { decimals: 2, trim: false })).toBe('2.50');
  });

  it('groups thousands: no-break space in Russian, comma in English', () => {
    expect(formatNumber('ru', 1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatNumber('en', 1234567)).toBe('1,234,567');
    expect(formatNumber('ru', 999)).toBe('999');
    expect(formatNumber('ru', 1000)).toBe(`1${NBSP}000`);
  });

  it('rounds half away from zero, also for negatives', () => {
    expect(formatNumber('en', 2.5)).toBe('3');
    expect(formatNumber('en', -2.5)).toBe('-3');
    expect(formatNumber('en', 0.125, { decimals: 2 })).toBe('0.13');
    expect(formatNumber('en', 1.005, { decimals: 2 })).toBe('1.01');
  });

  it('never prints a negative zero', () => {
    expect(formatNumber('en', -0.001, { decimals: 1 })).toBe('0');
    expect(formatNumber('en', -0)).toBe('0');
  });

  it('negative numbers keep the sign in front of the grouped value', () => {
    expect(formatNumber('en', -1234.5, { decimals: 1 })).toBe('-1,234.5');
  });

  it('property: the digits of an integer survive formatting', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
        const text = formatNumber('ru', n);
        expect(text.split(NBSP).join('')).toBe(String(n));
      }),
    );
  });
});

describe('pad2 and localParts', () => {
  it('pads to two digits', () => {
    expect(pad2(5)).toBe('05');
    expect(pad2(12)).toBe('12');
  });

  it('shifts to the local zone before reading the calendar', () => {
    const ts = Date.UTC(2026, 9, 14, 22, 30); // 14 Oct 22:30 UTC
    expect(localParts(ts, 0)).toMatchObject({
      year: 2026,
      month: 10,
      day: 14,
      hour: 22,
      minute: 30,
    });
    // Minsk, UTC+3: already the 15th
    expect(localParts(ts, 180)).toMatchObject({ month: 10, day: 15, hour: 1, minute: 30 });
    // New York, UTC-4
    expect(localParts(ts, -240)).toMatchObject({ day: 14, hour: 18, minute: 30 });
  });

  it('weekday is 0 for Monday and 6 for Sunday', () => {
    expect(localParts(Date.UTC(2026, 9, 12, 12), 0).weekday).toBe(0);
    expect(localParts(Date.UTC(2026, 9, 18, 12), 0).weekday).toBe(6);
  });

  it('dayIndex counts local calendar days', () => {
    const a = Date.UTC(2026, 9, 14, 22, 30);
    expect(localParts(a, 180).dayIndex - localParts(a, 0).dayIndex).toBe(1);
  });
});

describe('locale tables', () => {
  it.each(['ru', 'en'] as const)('%s has 12 months and 7 weekdays in every form', (locale) => {
    const data = LOCALES[locale];
    expect(data.monthsShort).toHaveLength(12);
    expect(data.monthsLong).toHaveLength(12);
    expect(data.weekdaysShort).toHaveLength(7);
    expect(data.weekdaysLong).toHaveLength(7);
  });
});
