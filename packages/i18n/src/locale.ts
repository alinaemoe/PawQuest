import type { Locale } from './types';

export interface LocaleData {
  readonly decimal: string;
  readonly group: string;
  readonly monthsShort: readonly string[];
  readonly weekdaysShort: readonly string[];
}

export const LOCALES: Readonly<Record<Locale, LocaleData>> = {
  ru: {
    decimal: ',',
    group: ' ',
    monthsShort: [
      'янв',
      'фев',
      'мар',
      'апр',
      'мая',
      'июн',
      'июл',
      'авг',
      'сен',
      'окт',
      'ноя',
      'дек',
    ],
    weekdaysShort: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'],
  },
  en: {
    decimal: '.',
    group: ',',
    monthsShort: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
};
