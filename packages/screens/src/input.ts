import type { UnitSystem } from '@pawquest/i18n';

const LB_PER_KG = 2.204_62;
const M_PER_MI = 1609.344;

/** A positive decimal typed on a phone keyboard: accepts a comma, ignores spaces, null otherwise. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Weight typed in kilograms (metric) or pounds (imperial) to whole grams. Anything outside what a
 * dog can weigh (50 g to 120 kg) is rejected as a typo.
 */
export function weightToGrams(text: string, units: UnitSystem): number | null {
  const value = parseDecimal(text);
  if (value === null) {
    return null;
  }
  const kg = units === 'imperial' ? value / LB_PER_KG : value;
  const grams = Math.round(kg * 1000);
  return grams >= 50 && grams <= 120_000 ? grams : null;
}

/** Distance typed in km or miles to whole meters; empty text means "not given" (null). */
export function distanceToMeters(text: string, units: UnitSystem): number | null {
  const value = parseDecimal(text);
  if (value === null) {
    return null;
  }
  const meters = Math.round(units === 'imperial' ? value * M_PER_MI : value * 1000);
  return meters > 0 && meters <= 200_000 ? meters : null;
}

/** Whole minutes of a walk: 1 minute to 24 hours. */
export function parseMinutes(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) {
    return null;
  }
  const minutes = Number(text.trim());
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}
