import type { PlanWithLast } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import {
  buildReminders,
  intervalLine,
  intervalText,
  planCard,
  planTitle,
  todayCareCard,
  type PlanCardModel,
} from './healthModel';

const ruI = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 0 });
const enI = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 0 });
const at = (y: number, m: number, d: number, h = 10): number => Date.UTC(y, m - 1, d, h);
const DAY = 86_400_000;
const NOW = at(2026, 10, 15);

const plan = (extra: Partial<PlanWithLast> = {}): PlanWithLast => ({
  id: 'p',
  dogId: 'd',
  templateKey: 'deworm',
  kind: 'parasite',
  subtype: 'deworm',
  title: 'Глистогонка',
  intervalDays: null,
  intervalMonths: 3,
  seasonFromMonth: null,
  seasonToMonth: null,
  remindDaysBefore: [7, 0],
  defaultProduct: null,
  enabled: true,
  lastDoneAt: null,
  lastProduct: null,
  ...extra,
});

describe('planTitle and intervalText', () => {
  it('built-in plans follow the language, custom plans keep their own title', () => {
    expect(planTitle(plan(), ruI)).toBe('Глистогонка');
    expect(planTitle(plan(), enI)).toBe('Deworming');
    expect(planTitle(plan({ templateKey: null, title: 'Зубы' }), enI)).toBe('Зубы');
  });

  it('words the interval, with the season', () => {
    expect(intervalText(plan(), ruI)).toBe('раз в 3 месяца');
    expect(intervalText(plan({ intervalMonths: 12 }), ruI)).toBe('раз в 12 месяцев');
    expect(
      intervalText(
        plan({ intervalMonths: null, intervalDays: 30, seasonFromMonth: 4, seasonToMonth: 10 }),
        ruI,
      ),
    ).toBe('раз в 30 дней · в сезон');
    expect(intervalText(plan({ intervalMonths: null, intervalDays: 1 }), enI)).toBe('every 1 day');
  });
});

describe('planCard', () => {
  it('a plan never marked is "not marked yet" and has no nagging', () => {
    const card = planCard(plan(), NOW, 0, ruI);
    expect(card).toMatchObject({
      status: 'unmarked',
      statusText: 'Ещё не отмечено',
      lastText: null,
      overdueDays: 0,
    });
  });

  it('upcoming: how many days are left', () => {
    const last = at(2026, 7, 20); // +3 months = 20 Oct, 5 days ahead
    const card = planCard(plan({ lastDoneAt: last, lastProduct: 'Препарат' }), NOW, 0, ruI);
    expect(card).toMatchObject({
      status: 'upcoming',
      statusText: 'через 5 дней',
      product: 'Препарат',
      upcomingDays: 5,
    });
    expect(card.lastText).toContain('Последний раз:');
  });

  it('today, and overdue in plain words without alarm', () => {
    expect(planCard(plan({ lastDoneAt: at(2026, 7, 15) }), NOW, 0, ruI).statusText).toBe('сегодня');
    const overdue = planCard(plan({ lastDoneAt: at(2026, 7, 12) }), NOW, 0, ruI);
    expect(overdue).toMatchObject({
      status: 'overdue',
      statusText: 'срок был 3 дня назад',
      overdueDays: 3,
    });
    expect(planCard(plan({ lastDoneAt: at(2026, 7, 12) }), NOW, 0, enI).statusText).toBe(
      'was due 3 days ago',
    );
  });

  it('falls back to the default product and carries the reminder window', () => {
    const card = planCard(
      plan({ defaultProduct: 'По умолчанию', remindDaysBefore: [30, 7, 0] }),
      NOW,
      0,
      ruI,
    );
    expect(card).toMatchObject({ product: 'По умолчанию', remindWindowDays: 30 });
  });

  it('a tick plan out of season waits for spring', () => {
    const tick = plan({
      templateKey: 'tick_flea',
      intervalMonths: null,
      intervalDays: 30,
      seasonFromMonth: 4,
      seasonToMonth: 10,
      lastDoneAt: at(2026, 10, 10),
    });
    const card = planCard(tick, NOW, 0, ruI);
    expect(card.status).toBe('upcoming');
    expect(card.upcomingDays).toBeGreaterThan(150);
  });
});

describe('todayCareCard', () => {
  const card = (
    status: PlanCardModel['status'],
    extra: Partial<PlanCardModel> = {},
  ): PlanCardModel => ({
    planId: `p-${status}-${String(extra.overdueDays ?? extra.upcomingDays ?? 0)}`,
    title: 't',
    status,
    statusText: 's',
    lastText: null,
    product: null,
    intervalText: '',
    overdueDays: 0,
    upcomingDays: Number.POSITIVE_INFINITY,
    remindWindowDays: 7,
    ...extra,
  });

  it('nothing to show when nothing is due', () => {
    expect(todayCareCard([])).toBeNull();
    expect(todayCareCard([card('unmarked'), card('upcoming', { upcomingDays: 30 })])).toBeNull();
  });

  it('overdue comes first, the most overdue of them', () => {
    const picked = todayCareCard([
      card('today'),
      card('overdue', { overdueDays: 2 }),
      card('overdue', { overdueDays: 9 }),
    ]);
    expect(picked?.overdueDays).toBe(9);
  });

  it('then today, then an upcoming one inside its reminder window, nearest first', () => {
    expect(todayCareCard([card('upcoming', { upcomingDays: 3 }), card('today')])?.status).toBe(
      'today',
    );
    expect(
      todayCareCard([
        card('upcoming', { upcomingDays: 6 }),
        card('upcoming', { upcomingDays: 2 }),
        card('upcoming', { upcomingDays: 20 }),
      ])?.upcomingDays,
    ).toBe(2);
  });
});

describe('intervalLine', () => {
  it('shows count and the real range of gaps', () => {
    const base = at(2026, 1, 1);
    expect(intervalLine('Глистогонка', [base, base + 88 * DAY, base + 183 * DAY], ruI)).toBe(
      'Глистогонка: 3 раза, интервал 88-95 дн. (n = 2)',
    );
  });

  it('one record gives only the count, none gives null', () => {
    expect(intervalLine('Глистогонка', [NOW], ruI)).toBe('Глистогонка: 1 раз');
    expect(intervalLine('Глистогонка', [], ruI)).toBeNull();
    expect(intervalLine('Deworming', [NOW, NOW + 90 * DAY], enI)).toBe(
      'Deworming: 2 times, interval 90-90 days (n = 1)',
    );
  });
});

describe('buildReminders', () => {
  it('plans a reminder a week ahead and on the due day, worded for each moment', () => {
    const reminders = buildReminders(
      [plan({ lastDoneAt: at(2026, 7, 25, 9) })], // due 25 Oct
      NOW,
      0,
      ruI,
    );
    expect(reminders.map((r) => [r.at, r.body])).toEqual([
      [at(2026, 10, 18, 10), 'через 7 дней'],
      [at(2026, 10, 25, 10), 'сегодня'],
    ]);
    expect(reminders[0]).toMatchObject({ planId: 'p', title: 'Глистогонка' });
    expect(reminders[0]?.id).toBe(`care-p-${String(at(2026, 10, 18, 10))}`);
  });

  it('skips moments already past, plans never marked, and disabled plans', () => {
    const marked = plan({ lastDoneAt: at(2026, 7, 16, 9) }); // due 16 Oct, window start 9 Oct passed
    expect(buildReminders([marked], NOW, 0, ruI).map((r) => r.body)).toEqual(['сегодня']);
    expect(buildReminders([plan()], NOW, 0, ruI)).toEqual([]);
    expect(
      buildReminders([plan({ lastDoneAt: at(2026, 7, 20), enabled: false })], NOW, 0, ruI),
    ).toEqual([]);
  });

  it('merges several plans in time order', () => {
    const vaccine = plan({
      id: 'v',
      templateKey: 'vaccination',
      intervalMonths: 12,
      remindDaysBefore: [30, 0],
      lastDoneAt: at(2025, 11, 10, 9),
    }); // due 10 Nov 2026: reminders 11 Oct (past), 10 Nov
    const deworm = plan({ lastDoneAt: at(2026, 7, 25, 9) });
    const list = buildReminders([vaccine, deworm], NOW, 0, enI);
    expect(list.map((r) => r.planId)).toEqual(['p', 'p', 'v']);
    expect(list.at(-1)?.title).toBe('Vaccination');
  });
});
