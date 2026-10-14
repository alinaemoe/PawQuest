// Spike S1 (docs/11-nfr-testing-risks.md): background GPS recording on a real device.
// The task is defined at module top level so that it exists when Android starts the app's JS
// in the background (the process can be killed while the foreground service keeps recording).
import * as Location from 'expo-location';
import { File, Paths } from 'expo-file-system';
import * as TaskManager from 'expo-task-manager';

export const GPS_TASK = 'pawquest-spike-gps';

/** One recorded fix, one JSON object per line in the log file. */
export interface LoggedFix {
  readonly ts: number;
  readonly lat: number;
  readonly lon: number;
  readonly accuracyM: number | null;
  readonly speedMps: number | null;
  readonly altitudeM: number | null;
  readonly mocked: boolean;
  /** When the app's JS received the fix (the gap to `ts` shows delivery delays). */
  readonly receivedAt: number;
}

export function logFile(): File {
  return new File(Paths.document, 'spike-gps.jsonl');
}

function appendLine(line: string): void {
  const file = logFile();
  if (!file.exists) {
    file.create();
  }
  file.write(`${line}\n`, { append: true });
}

/** Writes a free-form marker line (start/stop) into the same log. */
export function logMarker(kind: string): void {
  appendLine(JSON.stringify({ marker: kind, at: Date.now() }));
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(GPS_TASK, ({ data, error }) => {
  if (error !== null) {
    appendLine(JSON.stringify({ marker: 'task-error', at: Date.now(), message: error.message }));
    return Promise.resolve();
  }
  const receivedAt = Date.now();
  for (const location of data.locations) {
    const fix: LoggedFix = {
      ts: location.timestamp,
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracyM: location.coords.accuracy,
      speedMps: location.coords.speed,
      altitudeM: location.coords.altitude,
      mocked: location.mocked ?? false,
      receivedAt,
    };
    appendLine(JSON.stringify(fix));
  }
  return Promise.resolve();
});

export async function startRecording(): Promise<string> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return 'Нет разрешения на геолокацию (при использовании).';
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== Location.PermissionStatus.GRANTED) {
    return 'Нет фонового разрешения: в настройках приложения выбери «Разрешить всегда».';
  }
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) {
    return 'Запись уже идёт.';
  }
  logMarker('start');
  await Location.startLocationUpdatesAsync(GPS_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: 'PawQuest записывает прогулку',
      notificationBody: 'Маршрут сохраняется, пока идёт запись',
      notificationColor: '#2F7D5B',
      killServiceOnDestroy: false,
    },
  });
  return 'Запись началась. Можно гасить экран и идти гулять.';
}

export async function stopRecording(): Promise<string> {
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
    logMarker('stop');
    return 'Запись остановлена.';
  }
  return 'Запись не шла.';
}

/** Reads the log: fixes plus markers. */
export function readLog(): { fixes: LoggedFix[]; markers: { marker: string; at: number }[] } {
  const file = logFile();
  const fixes: LoggedFix[] = [];
  const markers: { marker: string; at: number }[] = [];
  if (!file.exists) {
    return { fixes, markers };
  }
  for (const line of file.textSync().split('\n')) {
    if (line.length === 0) {
      continue;
    }
    const parsed = JSON.parse(line) as Partial<LoggedFix> & { marker?: string; at?: number };
    if (typeof parsed.marker === 'string' && typeof parsed.at === 'number') {
      markers.push({ marker: parsed.marker, at: parsed.at });
    } else {
      fixes.push(parsed as LoggedFix);
    }
  }
  return { fixes, markers };
}

export function clearLog(): void {
  const file = logFile();
  if (file.exists) {
    file.delete();
  }
}
