import type { Message } from '../types';

/** Russian is the source dictionary: its keys define `MessageKey`, English must match them. */
export const ru = {
  'common.save': 'Сохранить',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.undo': 'Отменить',
  'common.back': 'Назад',
  'common.next': 'Дальше',
  'common.skip': 'Пропустить',
  'common.done': 'Готово',
  'common.later': 'Позже',
  'common.allow': 'Разрешить',

  'tab.today': 'Сегодня',
  'tab.walks': 'Прогулки',
  'tab.training': 'Тренировки',
  'tab.insights': 'Инсайты',
  'tab.dog': 'Собака',

  'time.today': 'сегодня',
  'time.yesterday': 'вчера',
  'time.justNow': 'только что',
  'time.minutesAgo': {
    one: '{n} минуту назад',
    few: '{n} минуты назад',
    many: '{n} минут назад',
    other: '{n} минуты назад',
  },
  'time.hoursAgo': {
    one: '{n} час назад',
    few: '{n} часа назад',
    many: '{n} часов назад',
    other: '{n} часа назад',
  },
  'time.daysAgo': {
    one: '{n} день назад',
    few: '{n} дня назад',
    many: '{n} дней назад',
    other: '{n} дня назад',
  },

  'unit.m': 'м',
  'unit.km': 'км',
  'unit.ft': 'фт',
  'unit.mi': 'ми',
  'unit.kg': 'кг',
  'unit.lb': 'фунт',
  'unit.h': 'ч',
  'unit.min': 'мин',
  'unit.s': 'с',
  'unit.perKm': '/км',
  'unit.perMi': '/ми',
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof ru;
