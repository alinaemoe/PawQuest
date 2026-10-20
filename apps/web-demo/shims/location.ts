// The browser has no walk to record: the demo replays a track instead (see src/demoWalk.ts).
export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;
export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
} as const;

export interface LocationObject {
  readonly coords: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number | null;
    readonly altitude: number | null;
    readonly speed: number | null;
  };
  readonly timestamp: number;
}

const granted = { status: 'granted', granted: true, canAskAgain: true } as const;
const HERE: LocationObject = {
  coords: { latitude: 55.7558, longitude: 37.6173, accuracy: 8, altitude: null, speed: null },
  timestamp: 0,
};

export const requestForegroundPermissionsAsync = (): Promise<typeof granted> =>
  Promise.resolve(granted);
export const requestBackgroundPermissionsAsync = (): Promise<typeof granted> =>
  Promise.resolve(granted);
export const getForegroundPermissionsAsync = (): Promise<typeof granted> =>
  Promise.resolve(granted);
export const hasStartedLocationUpdatesAsync = (): Promise<boolean> => Promise.resolve(false);
export const startLocationUpdatesAsync = (): Promise<void> => Promise.resolve();
export const stopLocationUpdatesAsync = (): Promise<void> => Promise.resolve();
export const getLastKnownPositionAsync = (): Promise<LocationObject | null> =>
  Promise.resolve(null);
export const getCurrentPositionAsync = (): Promise<LocationObject> =>
  Promise.resolve({ ...HERE, timestamp: Date.now() });
