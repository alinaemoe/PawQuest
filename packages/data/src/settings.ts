import { toIso, type Ctx } from './ids';
import type { SqlDb } from './sql';

export const PALETTE_KEYS = ['forest', 'sea', 'berry', 'sun'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const GOAL_KEYS = [
  'recall',
  'leash',
  'impulse',
  'calm',
  'social',
  'activity',
  'diary',
] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

/** Everything the user can change in Settings (spec 07), stored one JSON value per key. */
export interface AppSettings {
  language: 'ru' | 'en';
  units: 'metric' | 'imperial';
  palette: PaletteKey;
  /** `system` follows the phone. */
  scheme: 'system' | 'light' | 'dark';
  haptics: boolean;
  onboardingDone: boolean;
  activeDogId: string | null;
  goals: GoalKey[];
  /** G-10: modules the user switched off disappear from navigation and Today. */
  hiddenModules: string[];
  /** Days between "weigh your dog" reminders (S01-Wt). */
  weightIntervalDays: number;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  language: 'ru',
  units: 'metric',
  palette: 'forest',
  scheme: 'system',
  haptics: true,
  onboardingDone: false,
  activeDogId: null,
  goals: [],
  hiddenModules: [],
  weightIntervalDays: 14,
};

type Validators = { [K in keyof AppSettings]: (value: unknown) => value is AppSettings[K] };

const isOneOf =
  <T extends string>(options: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (options as readonly string[]).includes(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const VALIDATORS: Validators = {
  language: isOneOf(['ru', 'en'] as const),
  units: isOneOf(['metric', 'imperial'] as const),
  palette: isOneOf(PALETTE_KEYS),
  scheme: isOneOf(['system', 'light', 'dark'] as const),
  haptics: (v): v is boolean => typeof v === 'boolean',
  onboardingDone: (v): v is boolean => typeof v === 'boolean',
  activeDogId: (v): v is string | null => v === null || typeof v === 'string',
  goals: (v): v is GoalKey[] => isStringArray(v) && v.every((g) => isOneOf(GOAL_KEYS)(g)),
  hiddenModules: isStringArray,
  weightIntervalDays: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 365,
};

/** All settings, with the default for anything missing, unreadable or invalid. */
export function getSettings(db: SqlDb): AppSettings {
  const settings: AppSettings = { ...DEFAULT_SETTINGS, goals: [], hiddenModules: [] };
  const target = settings as unknown as Record<string, unknown>;
  for (const row of db.all('SELECT key, value FROM app_setting')) {
    const key = String(row['key']);
    if (!(key in VALIDATORS)) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(String(row['value']));
      if ((VALIDATORS as Record<string, (v: unknown) => boolean>)[key]?.(parsed) === true) {
        target[key] = parsed;
      }
    } catch {
      // a corrupt value falls back to the default
    }
  }
  return settings;
}

export function setSetting<K extends keyof AppSettings>(
  db: SqlDb,
  ctx: Ctx,
  key: K,
  value: AppSettings[K],
): void {
  if (!VALIDATORS[key](value)) {
    throw new Error(`Invalid value for setting ${key}`);
  }
  db.run(
    'INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, JSON.stringify(value), toIso(ctx.now())],
  );
}
