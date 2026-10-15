import { listPlans, type SqlDb } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';
import { buildReminders } from '@pawquest/screens';
import * as Notifications from 'expo-notifications';

export const CARE_CHANNEL = 'care';
export const CARE_CATEGORY = 'care';
const PREFIX = 'care-';
/** A snoozed reminder is a one-off: rescheduling the regular ones must not cancel it. */
const SNOOZE_PREFIX = 'care-snooze-';

/**
 * Makes the phone's scheduled notifications match the care plans: every old care reminder is
 * cancelled and the current ones are scheduled again (10:00 local on each reminder day). A refusal
 * of the notification permission is fine; the Today card still shows what is due (G-22).
 */
export async function syncCareReminders(db: SqlDb, i18n: I18n, dogId: string): Promise<number> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return 0;
  }
  await Notifications.setNotificationChannelAsync(CARE_CHANNEL, {
    name: i18n.t('health.title'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync(CARE_CATEGORY, [
    {
      identifier: 'done',
      buttonTitle: i18n.t('health.done'),
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'snooze',
      buttonTitle: i18n.t('today.weightLater'),
      options: { opensAppToForeground: false },
    },
  ]);

  for (const scheduled of await Notifications.getAllScheduledNotificationsAsync()) {
    if (
      scheduled.identifier.startsWith(PREFIX) &&
      !scheduled.identifier.startsWith(SNOOZE_PREFIX)
    ) {
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
  }

  const offset = -new Date().getTimezoneOffset();
  const reminders = buildReminders(listPlans(db, dogId), Date.now(), offset, i18n);
  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        categoryIdentifier: CARE_CATEGORY,
        data: { planId: reminder.planId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.at),
        channelId: CARE_CHANNEL,
      },
    });
  }
  return reminders.length;
}
