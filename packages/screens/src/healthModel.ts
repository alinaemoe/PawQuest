import type { PlanWithLast } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';
import { dueStatus, intervalStats, nextDue, reminderTimes, type DueKind } from '@pawquest/insights';

export type PlanStatus = DueKind | 'unmarked';

export interface PlanCardModel {
  readonly planId: string;
  readonly title: string;
  readonly status: PlanStatus;
  /** "через 12 дней", "сегодня", "срок был 3 дня назад", "Ещё не отмечено". */
  readonly statusText: string;
  /** "Последний раз: 3 мес. назад" or null. */
  readonly lastText: string | null;
  readonly product: string | null;
  /** "раз в 3 месяца · в сезон" */
  readonly intervalText: string;
  readonly overdueDays: number;
  readonly upcomingDays: number;
  readonly remindWindowDays: number;
}

/** Built-in plans are named in the current language; the owner's own plans keep their own title. */
export function planTitle(plan: Pick<PlanWithLast, 'templateKey' | 'title'>, i18n: I18n): string {
  return plan.templateKey === null ? plan.title : i18n.t(`care.${plan.templateKey}` as MessageKey);
}

export function intervalText(plan: PlanWithLast, i18n: I18n): string {
  const base =
    plan.intervalMonths !== null
      ? i18n.t('health.everyMonths', { n: plan.intervalMonths })
      : i18n.t('health.everyDays', { n: plan.intervalDays ?? 0 });
  return plan.seasonFromMonth === null ? base : `${base} · ${i18n.t('health.seasonOnly')}`;
}

/** What one plan says right now: when it is due, when it was last done, with what. */
export function planCard(
  plan: PlanWithLast,
  now: number,
  offsetMin: number,
  i18n: I18n,
): PlanCardModel {
  const due = nextDue(plan, plan.lastDoneAt, offsetMin);
  const status = due === null ? null : dueStatus(due, now, offsetMin);
  let statusText = i18n.t('health.notMarked');
  if (status?.kind === 'today') {
    statusText = i18n.t('health.dueToday');
  } else if (status?.kind === 'upcoming') {
    statusText = i18n.t('health.dueUpcoming', { n: status.days });
  } else if (status?.kind === 'overdue') {
    statusText = i18n.t('health.dueOverdue', { n: status.days });
  }
  return {
    planId: plan.id,
    title: planTitle(plan, i18n),
    status: status?.kind ?? 'unmarked',
    statusText,
    lastText:
      plan.lastDoneAt === null
        ? null
        : i18n.t('health.last', { when: i18n.formatAgo(plan.lastDoneAt, now) }),
    product: plan.lastProduct ?? plan.defaultProduct,
    intervalText: intervalText(plan, i18n),
    overdueDays: status?.kind === 'overdue' ? status.days : 0,
    upcomingDays: status?.kind === 'upcoming' ? status.days : Number.POSITIVE_INFINITY,
    remindWindowDays: Math.max(0, ...plan.remindDaysBefore),
  };
}

/**
 * The one health card Today may show (G-22): overdue first (the most overdue), then due today,
 * then the nearest upcoming one that is inside its own reminder window. Plans never marked do not
 * nag: they show on the Health screen only.
 */
export function todayCareCard(cards: readonly PlanCardModel[]): PlanCardModel | null {
  const overdue = cards
    .filter((c) => c.status === 'overdue')
    .sort((a, b) => b.overdueDays - a.overdueDays)[0];
  if (overdue !== undefined) {
    return overdue;
  }
  const today = cards.find((c) => c.status === 'today');
  if (today !== undefined) {
    return today;
  }
  return (
    cards
      .filter((c) => c.status === 'upcoming' && c.upcomingDays <= c.remindWindowDays)
      .sort((a, b) => a.upcomingDays - b.upcomingDays)[0] ?? null
  );
}

/** "Глистогонка: 4 раза, интервал 88-95 дн. (n = 3)"; just the count with a single record. */
export function intervalLine(name: string, doneAt: readonly number[], i18n: I18n): string | null {
  if (doneAt.length === 0) {
    return null;
  }
  const times = i18n.t('health.times', { n: doneAt.length });
  const stats = intervalStats(doneAt);
  if (stats === null) {
    return i18n.t('health.intervalSingle', { name, times });
  }
  return i18n.t('health.intervalLine', {
    name,
    times,
    min: stats.minDays,
    max: stats.maxDays,
    n: stats.n,
  });
}

export interface ReminderPlan {
  /** Stable id so the same reminder is replaced, not duplicated, when rescheduling. */
  readonly id: string;
  readonly planId: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Local reminders for every enabled plan that has been marked at least once: at 10:00 on each
 * "days before" day that is still ahead, worded for the moment it fires ("через 7 дней", "сегодня").
 */
export function buildReminders(
  plans: readonly PlanWithLast[],
  now: number,
  offsetMin: number,
  i18n: I18n,
): ReminderPlan[] {
  const result: ReminderPlan[] = [];
  for (const plan of plans) {
    if (!plan.enabled) {
      continue;
    }
    const due = nextDue(plan, plan.lastDoneAt, offsetMin);
    if (due === null) {
      continue;
    }
    for (const at of reminderTimes(due, plan.remindDaysBefore, now, offsetMin)) {
      const status = dueStatus(due, at, offsetMin);
      result.push({
        id: `care-${plan.id}-${String(at)}`,
        planId: plan.id,
        at,
        title: planTitle(plan, i18n),
        body:
          status.kind === 'today'
            ? i18n.t('health.dueToday')
            : i18n.t('health.dueUpcoming', { n: status.days }),
      });
    }
  }
  return result.sort((a, b) => a.at - b.at);
}
