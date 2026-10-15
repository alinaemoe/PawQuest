import { en } from './dictionaries/en';
import { ru, type MessageKey } from './dictionaries/ru';
import { formatNumber, localParts, pad2 } from './format';
import { LOCALES } from './locale';
import { translate, type Dictionary } from './translate';
import type { Locale, Params, UnitSystem } from './types';

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { ru, en };

const FT_PER_M = 3.280_84;
const M_PER_MI = 1609.344;
const LB_PER_KG = 2.204_62;

export interface I18nOptions {
  readonly locale: Locale;
  readonly units: UnitSystem;
  /** Minutes east of UTC at a moment. Defaults to the device zone; tests inject a fixed one. */
  readonly tzOffsetMin?: (ts: number) => number;
}

export interface I18n {
  readonly locale: Locale;
  readonly units: UnitSystem;
  t(key: MessageKey, params?: Params): string;
  formatNumber(value: number, decimals?: number): string;
  /** 850 m / 1,84 km, or ft and miles for imperial. */
  formatDistance(meters: number): string;
  /** 45 с / 32 мин / 1 ч 05 мин. */
  formatDuration(seconds: number): string;
  /** 00:12:34 */
  formatClock(seconds: number): string;
  /** 12:30 /км for minutes per kilometer, or a dash when the pace is unknown. */
  formatPace(minPerKm: number | null): string;
  /** 6,2 кг / 13.7 lb from grams. */
  formatWeight(grams: number): string;
  /** 14:05, 24-hour (G-07). */
  formatTime(ts: number): string;
  /** 12 окт, with the year when it is not the current one. */
  formatDate(ts: number, now: number): string;
  /** сегодня / вчера / 12 окт */
  formatDay(ts: number, now: number): string;
  /** только что / 12 минут назад / 4 часа назад / вчера / 3 дня назад / 12 окт */
  formatAgo(ts: number, now: number): string;
}

function deviceOffset(ts: number): number {
  return -new Date(ts).getTimezoneOffset();
}

/** Everything screens need to show text and numbers: one object per (locale, units) pair. */
export function createI18n(options: I18nOptions): I18n {
  const { locale, units } = options;
  const offsetAt = options.tzOffsetMin ?? deviceOffset;
  const dictionary = DICTIONARIES[locale];
  const t = (key: MessageKey, params?: Params): string =>
    translate(locale, dictionary, key, params);
  const num = (value: number, decimals = 0): string => formatNumber(locale, value, { decimals });

  const formatDistance = (meters: number): string => {
    if (units === 'imperial') {
      const feet = meters * FT_PER_M;
      if (feet < 1000) {
        return `${num(feet)} ${t('unit.ft')}`;
      }
      return `${num(meters / M_PER_MI, 2)} ${t('unit.mi')}`;
    }
    if (meters < 1000) {
      return `${num(meters)} ${t('unit.m')}`;
    }
    const km = meters / 1000;
    return `${num(km, km < 10 ? 2 : 1)} ${t('unit.km')}`;
  };

  const formatDuration = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) {
      return `${String(total)} ${t('unit.s')}`;
    }
    const minutesTotal = Math.round(total / 60);
    const h = Math.floor(minutesTotal / 60);
    const m = minutesTotal % 60;
    if (h === 0) {
      return `${String(m)} ${t('unit.min')}`;
    }
    return `${String(h)} ${t('unit.h')} ${pad2(m)} ${t('unit.min')}`;
  };

  const formatClock = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds));
    return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
  };

  const formatPace = (minPerKm: number | null): string => {
    if (minPerKm === null || !Number.isFinite(minPerKm) || minPerKm <= 0) {
      return '—';
    }
    const perUnit = units === 'imperial' ? (minPerKm * M_PER_MI) / 1000 : minPerKm;
    const totalSeconds = Math.round(perUnit * 60);
    const suffix = units === 'imperial' ? t('unit.perMi') : t('unit.perKm');
    return `${String(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)} ${suffix}`;
  };

  const formatWeight = (grams: number): string => {
    const kg = grams / 1000;
    if (units === 'imperial') {
      return `${num(kg * LB_PER_KG, 1)} ${t('unit.lb')}`;
    }
    return `${num(kg, 1)} ${t('unit.kg')}`;
  };

  const formatTime = (ts: number): string => {
    const p = localParts(ts, offsetAt(ts));
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  };

  const formatDate = (ts: number, now: number): string => {
    const p = localParts(ts, offsetAt(ts));
    const current = localParts(now, offsetAt(now));
    const month = LOCALES[locale].monthsShort[p.month - 1] ?? '';
    const base = locale === 'ru' ? `${String(p.day)} ${month}` : `${month} ${String(p.day)}`;
    return p.year === current.year ? base : `${base} ${String(p.year)}`;
  };

  const dayDifference = (ts: number, now: number): number =>
    localParts(now, offsetAt(now)).dayIndex - localParts(ts, offsetAt(ts)).dayIndex;

  const formatDay = (ts: number, now: number): string => {
    const diff = dayDifference(ts, now);
    if (diff === 0) {
      return t('time.today');
    }
    if (diff === 1) {
      return t('time.yesterday');
    }
    return formatDate(ts, now);
  };

  const formatAgo = (ts: number, now: number): string => {
    const elapsedS = (now - ts) / 1000;
    const diff = dayDifference(ts, now);
    if (elapsedS < 0 || diff < 0) {
      return formatDate(ts, now);
    }
    if (diff === 0) {
      if (elapsedS < 60) {
        return t('time.justNow');
      }
      if (elapsedS < 3600) {
        return t('time.minutesAgo', { n: Math.floor(elapsedS / 60) });
      }
      return t('time.hoursAgo', { n: Math.floor(elapsedS / 3600) });
    }
    if (diff === 1) {
      return t('time.yesterday');
    }
    if (diff < 7) {
      return t('time.daysAgo', { n: diff });
    }
    return formatDate(ts, now);
  };

  return {
    locale,
    units,
    t,
    formatNumber: num,
    formatDistance,
    formatDuration,
    formatClock,
    formatPace,
    formatWeight,
    formatTime,
    formatDate,
    formatDay,
    formatAgo,
  };
}
