import {
  autoFinishAtBase,
  getRunningWalkId,
  getSettings,
  hidePrompt,
  isPromptHidden,
  walkBaseArrival,
  walkStartSpotArrival,
  type Ctx,
  type SqlDb,
} from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

/** The check looks at the whole track: once in this long is enough while fixes arrive every second. */
const CHECK_EVERY_MS = 30_000;
let lastCheck = 0;

/**
 * "I came home and forgot to press finish": a running walk that stands in a base for five minutes
 * ends by itself at the moment of arrival. Called from the GPS task (so it works with the screen
 * off) and from the open walk screen. When the app is closed a notice says what happened.
 * Returns the id of the walk it finished.
 */
export async function maybeAutoFinish(
  db: SqlDb,
  ctx: Ctx,
  stopGps: () => Promise<void>,
  now = Date.now(),
): Promise<string | null> {
  if (now - lastCheck < CHECK_EVERY_MS) {
    return null;
  }
  lastCheck = now;
  const settings = getSettings(db);
  const walkId = getRunningWalkId(db);
  if (walkId === null) {
    return null;
  }
  const done = settings.autoFinishAtHome ? autoFinishAtBase(db, ctx, walkId, now) : null;
  if (done === null) {
    await askToFinish(db, ctx, walkId, now, settings.language, settings.units);
    return null;
  }
  await stopGps();
  if (AppState.currentState !== 'active') {
    const i18n = createI18n({ locale: settings.language, units: settings.units });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('autofinish.title'),
        body: i18n.t('autofinish.body', {
          place: done.placeName,
          time: i18n.formatTime(done.arrivedAt),
        }),
      },
      trigger: null,
    });
  }
  return done.walk.id;
}

const DAY = 86_400_000;

/**
 * When the walk was left running (the owner is back at the start, or in a base, for a while) but
 * did not end by itself, a notice says so once per walk; the question itself is in the app.
 */
async function askToFinish(
  db: SqlDb,
  ctx: Ctx,
  walkId: string,
  now: number,
  language: 'ru' | 'en',
  units: 'metric' | 'imperial',
): Promise<void> {
  const key = `arrival-notified:${walkId}`;
  if (AppState.currentState === 'active' || isPromptHidden(db, key, now)) {
    return;
  }
  if (walkBaseArrival(db, walkId, now) === null && walkStartSpotArrival(db, walkId, now) === null) {
    return;
  }
  hidePrompt(db, ctx, key, now + DAY);
  const i18n = createI18n({ locale: language, units });
  await Notifications.scheduleNotificationAsync({
    content: { title: i18n.t('autofinish.askTitle'), body: i18n.t('autofinish.askBody') },
    trigger: null,
  });
}
