// Spike S5: a persistent walk notification with action buttons. A tap on a button must record an
// event even when the screen is locked, so the listener lives at module top level (not in a screen).
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

// Android channels cannot be changed after creation, so a new setup gets a new id.
const CHANNEL_ID = 'walk-actions-v2';
const CATEGORY_ID = 'walk';
const NOTIFICATION_KEY = 'pawquest-walk';

export interface NotifEvent {
  readonly at: number;
  readonly action: string;
  readonly appState: string;
}

function logFile(): File {
  return new File(Paths.document, 'spike-notif.jsonl');
}

function appendLine(line: string): void {
  const file = logFile();
  if (!file.exists) {
    file.create();
  }
  file.write(`${line}\n`, { append: true });
}

Notifications.setNotificationHandler({
  // eslint-disable-next-line @typescript-eslint/require-await -- the API wants a promise
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Defined at import time: a response can arrive when the app was started in the background.
Notifications.addNotificationResponseReceivedListener((response) => {
  const event: NotifEvent = {
    at: Date.now(),
    action: response.actionIdentifier,
    appState: AppState.currentState,
  };
  appendLine(JSON.stringify(event));
  // visible in logcat, so a locked-screen test can be checked without unlocking the phone
  console.warn(`[pq-notif] ${event.action} appState=${event.appState}`);
});

export function readNotifEvents(): NotifEvent[] {
  const file = logFile();
  if (!file.exists) {
    return [];
  }
  return file
    .textSync()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as NotifEvent);
}

export function clearNotifEvents(): void {
  const file = logFile();
  if (file.exists) {
    file.delete();
  }
}

export async function showWalkNotification(): Promise<string> {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    return 'Нет разрешения на уведомления';
  }
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Прогулка',
    // Quiet notifications are hidden on the One UI lock screen, so use DEFAULT importance
    // without sound or vibration and make the content visible there.
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: 'dog', buttonTitle: 'Собака', options: { opensAppToForeground: false } },
    { identifier: 'ok', buttonTitle: 'Успех', options: { opensAppToForeground: false } },
    { identifier: 'hard', buttonTitle: 'Сложно', options: { opensAppToForeground: false } },
  ]);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_KEY,
    content: {
      title: 'PawQuest: идёт прогулка',
      body: 'Отметь событие, не разблокируя телефон',
      categoryIdentifier: CATEGORY_ID,
      sticky: true,
      autoDismiss: false,
    },
    trigger: { channelId: CHANNEL_ID },
  });
  return 'Уведомление показано';
}

export async function hideWalkNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(NOTIFICATION_KEY);
}
