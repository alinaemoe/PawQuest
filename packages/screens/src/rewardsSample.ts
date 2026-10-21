import type { BasisRow, GoalEditRow, LadderStep, PawEntryGroup } from './RewardsScreens';
import type { AchievementModel, GoalRowModel } from './rewardsModel';
import type { LevelModel, StreakModel } from './RewardsViews';

/**
 * Invented data of the design showcase (web demo `?preview=rewards`), worded in Russian. The real
 * screens get the same shapes from the data layer (docs/25 §6).
 */

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 21);

export const SAMPLE_STREAK: StreakModel = {
  days: 5,
  best: 14,
  week: [
    { label: 'пн', state: 'record' },
    { label: 'вт', state: 'record' },
    { label: 'ср', state: 'rest' },
    { label: 'чт', state: 'record' },
    { label: 'пт', state: 'pause' },
    { label: 'сб', state: 'record' },
    { label: 'вс', state: 'today' },
  ],
  note: 'Среда: день отдыха. Пятница закрыта лапой-паузой, осталась 1 из 2.',
  canRest: true,
  restToday: false,
};

export const SAMPLE_LEVEL: LevelModel = {
  name: 'Следопыт',
  total: 340,
  progress: (340 - 200) / (600 - 200),
  nextName: 'Наблюдатель',
  toNext: 260,
};

export const SAMPLE_GOALS: readonly GoalRowModel[] = [
  { id: 'g1', icon: 'target', title: 'Тренировки', value: 2, target: 3 },
  { id: 'g2', icon: 'note', title: 'Наблюдения', value: 5, target: 5 },
  { id: 'g3', icon: 'map', title: 'Новое место', value: 0, target: 1 },
];

export const SAMPLE_SUGGESTION: readonly GoalRowModel[] = [
  { id: 's1', icon: 'paw', title: 'Прогулки с итогом', value: 0, target: 4 },
  { id: 's2', icon: 'target', title: 'Тренировки', value: 0, target: 3 },
  { id: 's3', icon: 'note', title: 'Наблюдения', value: 0, target: 6 },
];

function ach(
  id: string,
  title: string,
  condition: string,
  section: AchievementModel['section'],
  icon: AchievementModel['icon'],
  rest: Partial<AchievementModel>,
): AchievementModel {
  return {
    id,
    title,
    condition,
    section,
    icon,
    mastery: false,
    hidden: false,
    steps: 3,
    tier: 0,
    value: 0,
    nextAt: null,
    earnedOn: null,
    earnedAt: null,
    isNew: false,
    ...rest,
  };
}

export const SAMPLE_ACHIEVEMENTS: readonly AchievementModel[] = [
  ach('routine', 'Рутина', 'Прогулок с итогом', 'walks', 'paw', {
    tier: 2,
    value: 63,
    nextAt: 200,
    earnedOn: '12 окт',
    earnedAt: T0 - 9 * DAY,
    isNew: true,
  }),
  ach('roads', 'Разные дороги', 'Разных маршрутов', 'walks', 'map', {
    tier: 1,
    value: 9,
    nextAt: 15,
    earnedOn: '2 окт',
    earnedAt: T0 - 19 * DAY,
  }),
  ach('days', 'Дни с записью', 'Серия дней, дни отдыха считаются', 'walks', 'calendar', {
    tier: 1,
    value: 14,
    nextAt: 30,
    earnedOn: '9 окт',
    earnedAt: T0 - 12 * DAY,
  }),
  ach('rain', 'Дождь не помеха', 'Прогулок при осадках', 'walks', 'drop', {
    tier: 1,
    value: 8,
    nextAt: 20,
    earnedOn: '14 окт',
    earnedAt: T0 - 7 * DAY,
  }),
  ach(
    'slow',
    'Без спешки',
    '10 прогулок с обнюхиванием не меньше пятой части времени',
    'walks',
    'heart',
    {
      steps: 1,
      value: 6,
      nextAt: 10,
    },
  ),
  ach('watcher', 'Наблюдатель', 'Событий записано', 'observations', 'note', {
    tier: 1,
    value: 63,
    nextAt: 150,
    earnedOn: '30 сен',
    earnedAt: T0 - 21 * DAY,
  }),
  ach(
    'calm',
    'Спокойный отрезок',
    '30 минут без «Сложно» на прогулке от получаса',
    'observations',
    'heart',
    {
      tier: 1,
      value: 3,
      nextAt: 10,
      earnedOn: '15 окт',
      earnedAt: T0 - 6 * DAY,
      isNew: true,
    },
  ),
  ach('photos', 'Хроникёр', 'Фотографий', 'observations', 'camera', {
    tier: 0,
    value: 18,
    nextAt: 25,
  }),
  ach('practice', 'Практик', 'Тренировочных сессий', 'training', 'target', {
    tier: 1,
    value: 23,
    nextAt: 50,
    earnedOn: '4 окт',
    earnedAt: T0 - 17 * DAY,
  }),
  ach('attempts', 'Тысяча попыток', 'Попыток суммарно', 'training', 'target', {
    tier: 1,
    value: 212,
    nextAt: 500,
    earnedOn: '8 окт',
    earnedAt: T0 - 13 * DAY,
  }),
  ach(
    'stability',
    'Стабильность',
    '10 сессий подряд с долей успеха не ниже 80%',
    'training',
    'star',
    {
      mastery: true,
      steps: 1,
      value: 7,
      nextAt: 10,
    },
  ),
  ach(
    'street',
    'На улице как дома',
    'Успех не ниже 80% на улице при отвлечении от 3, не меньше 15 попыток',
    'training',
    'map',
    {
      mastery: true,
      steps: 1,
      value: 9,
      nextAt: 15,
    },
  ),
  ach('explorer', 'Исследователь', 'Мест в библиотеке с визитами', 'places', 'pin', {
    tier: 1,
    value: 5,
    nextAt: 15,
    earnedOn: '28 сен',
    earnedAt: T0 - 23 * DAY,
  }),
  ach('district', 'Свой район', '10 визитов в одно место', 'places', 'home', {
    steps: 1,
    tier: 1,
    value: 10,
    nextAt: null,
    earnedOn: '28 сен',
    earnedAt: T0 - 23 * DAY,
  }),
  ach('order', 'Порядок в мире', 'Объединены дубликаты мест', 'places', 'pin', {
    steps: 1,
    tier: 1,
    hidden: true,
    nextAt: null,
    earnedOn: '12 окт',
    earnedAt: T0 - 9 * DAY,
  }),
  ach('vet', 'К врачу с отчётом', 'Экспортирован PDF для ветеринара', 'data', 'clipboard', {
    steps: 1,
    hidden: true,
    nextAt: 1,
  }),
  ach('backup', 'Резервная копия', 'Первый экспорт JSON', 'data', 'note', {
    steps: 1,
    tier: 1,
    nextAt: null,
    earnedOn: '5 окт',
    earnedAt: T0 - 16 * DAY,
  }),
];

export const SAMPLE_LADDER: readonly LadderStep[] = [
  { tier: 1, at: 10, date: '3 окт' },
  { tier: 2, at: 50, date: '12 окт' },
  { tier: 3, at: 200, date: null },
];

export const SAMPLE_BASIS: readonly BasisRow[] = [
  { id: 'w1', title: 'Прогулка · Парк у дома', subtitle: '20 окт, 42 мин, итог заполнен' },
  { id: 'w2', title: 'Прогулка · Поляна', subtitle: '19 окт, 55 мин, итог заполнен' },
  { id: 'w3', title: 'Прогулка · Двор', subtitle: '18 окт, 18 мин, итог заполнен' },
  { id: 'w4', title: 'Прогулка · Парк у дома', subtitle: '17 окт, 38 мин, итог заполнен' },
];

export const SAMPLE_PAW_WEEK = [
  { label: 'пн', value: 31 },
  { label: 'вт', value: 18 },
  { label: 'ср', value: 0 },
  { label: 'чт', value: 44 },
  { label: 'пт', value: 0 },
  { label: 'сб', value: 62 },
  { label: 'вс', value: 35 },
];

export const SAMPLE_PAW_HISTORY: readonly PawEntryGroup[] = [
  {
    day: 'Сегодня',
    items: [
      { id: 'a', text: 'Прогулка сохранена', delta: 10, revoked: false },
      { id: 'b', text: 'Итог прогулки заполнен', delta: 5, revoked: false },
      { id: 'c', text: 'События на прогулке: 8', delta: 8, revoked: false },
      { id: 'd', text: 'Тренировка сохранена', delta: 10, revoked: false },
      { id: 'e', text: 'Попытки в тренировке: 12', delta: 2, revoked: false },
    ],
  },
  {
    day: 'Вчера',
    items: [
      { id: 'f', text: 'Прогулка сохранена', delta: 10, revoked: false },
      { id: 'g', text: 'Цель недели: наблюдения 5 из 5', delta: 30, revoked: false },
      { id: 'h', text: 'Прогулка за город', delta: -10, revoked: true },
    ],
  },
];

export const SAMPLE_PAW_HOW = [
  { text: 'Прогулка сохранена', delta: '+10' },
  { text: 'Итог прогулки заполнен', delta: '+5' },
  { text: 'Событие записано (до 20 за прогулку)', delta: '+1' },
  { text: 'Событие дополнено подробностями', delta: '+3' },
  { text: 'Тренировка сохранена', delta: '+10' },
  { text: 'Каждые две попытки (до 10 за тренировку)', delta: '+1' },
  { text: 'Цель недели выполнена', delta: '+30' },
  { text: 'Новое место добавлено', delta: '+10' },
];

export const SAMPLE_GOAL_EDIT: readonly GoalEditRow[] = [
  { id: 'walks', icon: 'paw', title: 'Прогулки с итогом', usual: '3 прогулки в неделю', target: 0 },
  { id: 'sessions', icon: 'target', title: 'Тренировки', usual: '2 сессии в неделю', target: 3 },
  { id: 'obs', icon: 'note', title: 'Наблюдения', usual: '5 событий в неделю', target: 5 },
  { id: 'places', icon: 'map', title: 'Новое место', usual: 'раз в две недели', target: 1 },
  { id: 'two', icon: 'star', title: 'Навык в двух условиях', usual: 'пока не было', target: 0 },
  { id: 'calm', icon: 'heart', title: 'Спокойная прогулка', usual: '1 в неделю', target: 0 },
];
