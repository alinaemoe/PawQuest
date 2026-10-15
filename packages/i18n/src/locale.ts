import type { Locale } from './types';

export interface LocaleData {
  readonly decimal: string;
  readonly group: string;
  readonly monthsShort: readonly string[];
  /** Month names as used after a day number ("14 октября"). */
  readonly monthsLong: readonly string[];
  /** Monday first. */
  readonly weekdaysShort: readonly string[];
  readonly weekdaysLong: readonly string[];
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
    monthsLong: [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ],
    weekdaysShort: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'],
    weekdaysLong: [
      'Понедельник',
      'Вторник',
      'Среда',
      'Четверг',
      'Пятница',
      'Суббота',
      'Воскресенье',
    ],
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
    monthsLong: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    weekdaysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
};
