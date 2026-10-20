// Notifications do not exist in the web demo: every call is accepted and does nothing.
export const SchedulableTriggerInputTypes = {
  DATE: 'date',
  DAILY: 'daily',
  TIME_INTERVAL: 'timeInterval',
} as const;
export const AndroidNotificationVisibility = { PUBLIC: 1, PRIVATE: 0, SECRET: -1 } as const;
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MIN: 1, MAX: 5 } as const;

const granted = { status: 'granted', granted: true, canAskAgain: true } as const;

export const setNotificationHandler = (): void => undefined;
export const setNotificationChannelAsync = (): Promise<null> => Promise.resolve(null);
export const setNotificationCategoryAsync = (): Promise<null> => Promise.resolve(null);
export const requestPermissionsAsync = (): Promise<typeof granted> => Promise.resolve(granted);
export const getPermissionsAsync = (): Promise<typeof granted> => Promise.resolve(granted);
export const scheduleNotificationAsync = (): Promise<string> => Promise.resolve('web-demo');
export const cancelScheduledNotificationAsync = (): Promise<void> => Promise.resolve();
export const dismissNotificationAsync = (): Promise<void> => Promise.resolve();
export const getAllScheduledNotificationsAsync = (): Promise<never[]> => Promise.resolve([]);
export const addNotificationResponseReceivedListener = (): { remove: () => void } => ({
  remove: () => undefined,
});
