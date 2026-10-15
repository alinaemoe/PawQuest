import { LOCALES } from './locale';
import type { Locale } from './types';

export interface NumberOptions {
  /** Digits after the decimal separator. Default 0. */
  readonly decimals?: number;
  /** Drop trailing zeros ("2,50" -> "2,5"). Default true. */
  readonly trim?: boolean;
}

/** Rounds half away from zero: `Math.round(-2.5)` would give -2. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return (
    (Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON * factor)) / factor
  );
}

/** Number with the locale's decimal and thousands separators. */
export function formatNumber(locale: Locale, value: number, options: NumberOptions = {}): string {
  const { decimals = 0, trim = true } = options;
  const data = LOCALES[locale];
  const rounded = roundTo(value, decimals);
  const negative = rounded < 0;
  const fixed = Math.abs(rounded).toFixed(decimals);
  const [whole = '0', fraction = ''] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, data.group);
  const frac = trim ? fraction.replace(/0+$/, '') : fraction;
  const text = frac === '' ? grouped : `${grouped}${data.decimal}${frac}`;
  return negative ? `-${text}` : text;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface LocalParts {
  readonly year: number;
  /** 1..12 */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** Whole local days since 1970-01-01, for calendar-day differences. */
  readonly dayIndex: number;
}

/** Calendar fields of a moment in the zone given by `offsetMin` (minutes east of UTC). */
export function localParts(ts: number, offsetMin: number): LocalParts {
  const shifted = new Date(ts + offsetMin * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dayIndex: Math.floor((ts + offsetMin * 60_000) / 86_400_000),
  };
}
