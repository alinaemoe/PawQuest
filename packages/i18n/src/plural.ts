import type { Locale, PluralCategory } from './types';

/**
 * CLDR plural category of a number. Written by hand because Hermes' `Intl.PluralRules` support
 * differs between devices. Non-integers always fall into `other` ("1,5 часа", "1.5 hours").
 */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  if (!Number.isInteger(n)) {
    return 'other';
  }
  const abs = Math.abs(n);
  if (locale === 'en') {
    return abs === 1 ? 'one' : 'other';
  }
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'one';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'few';
  }
  return 'many';
}
