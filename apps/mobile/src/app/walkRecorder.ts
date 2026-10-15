// Background GPS for real walks (spec 4.1/4.3). The task is defined at module top level so that it
// exists when Android starts the app's JS in the background: the foreground service keeps recording
// while the screen is off (proven in spike S1). Fixes go straight into SQLite, batch by batch.
import { appendTrackPoints, getRunningWalkId } from '@pawquest/data';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getRuntime } from './runtime';

export const WALK_TASK = 'pawquest-walk-gps';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(WALK_TASK, ({ data, error }) => {
  if (error !== null || data.locations.length === 0) {
    return Promise.resolve();
  }
  const { db } = getRuntime();
  const walkId = getRunningWalkId(db);
  if (walkId === null) {
    return Promise.resolve();
  }
  appendTrackPoints(
    db,
    walkId,
    data.locations.map((l) => ({
      ts: l.timestamp,
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      accuracyM: l.coords.accuracy,
      altitudeM: l.coords.altitude,
      speedMps: l.coords.speed,
    })),
  );
  return Promise.resolve();
});

export type GpsPermission = 'ok' | 'foreground-only' | 'denied';

/** Asks for location while using the app and, if possible, in the background (spec S02-B). */
export async function requestGpsPermission(): Promise<GpsPermission> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return 'denied';
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === Location.PermissionStatus.GRANTED ? 'ok' : 'foreground-only';
}

export async function startGpsUpdates(title: string, body: string): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(WALK_TASK)) {
    return;
  }
  await Location.startLocationUpdatesAsync(WALK_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: title,
      notificationBody: body,
      notificationColor: '#2F7D5B',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopGpsUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(WALK_TASK)) {
    await Location.stopLocationUpdatesAsync(WALK_TASK);
  }
}
