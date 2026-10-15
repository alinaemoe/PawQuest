// Actions on a care reminder ("Done" / "Later") work without opening the app. The listener lives at
// module level for the same reason as in spike S5: a response may arrive while no screen exists.
import { getPlan, getSettings, listPlans, logCare } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import * as Notifications from 'expo-notifications';

import { CARE_CHANNEL, CARE_CATEGORY, syncCareReminders } from './reminders';
import { getRuntime } from './runtime';

const DAY = 86_400_000;

Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data as { planId?: unknown } | undefined;
  const planId = typeof data?.planId === 'string' ? data.planId : null;
  if (planId === null) {
    return;
  }
  const { db, ctx } = getRuntime();
  const plan = getPlan(db, planId);
  if (plan === null) {
    return;
  }
  const settings = getSettings(db);
  const i18n = createI18n({ locale: settings.language, units: settings.units });

  if (response.actionIdentifier === 'done') {
    const last = listPlans(db, plan.dogId).find((p) => p.id === plan.id);
    logCare(db, ctx, {
      dogId: plan.dogId,
      kind: plan.kind,
      subtype: plan.subtype,
      title: plan.title,
      doneAt: ctx.now(),
      planId: plan.id,
      product: last?.lastProduct ?? plan.defaultProduct,
    });
    void syncCareReminders(db, i18n, plan.dogId);
  } else if (response.actionIdentifier === 'snooze') {
    const tomorrow = new Date(ctx.now() + DAY);
    tomorrow.setHours(10, 0, 0, 0);
    void Notifications.scheduleNotificationAsync({
      identifier: `care-snooze-${plan.id}`,
      content: {
        title: plan.title,
        body: i18n.t('health.dueToday'),
        categoryIdentifier: CARE_CATEGORY,
        data: { planId: plan.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
        channelId: CARE_CHANNEL,
      },
    });
  }
});
