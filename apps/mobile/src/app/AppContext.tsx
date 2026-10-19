import {
  createDog,
  deleteDemoData,
  getDog,
  getSettings,
  listDogs,
  seedDemoData,
  setSetting,
  type AppSettings,
  type Ctx,
  type Dog,
  type DogInput,
  type SqlDb,
} from '@pawquest/data';
import { createI18n, type I18n } from '@pawquest/i18n';
import { I18nProvider, ThemeProvider, ToastProvider, useTheme } from '@pawquest/rn-ui';
import { useFonts } from 'expo-font';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_ASSETS } from './fonts';
import { detectLanguage, getRuntime } from './runtime';

export interface AppContextValue {
  readonly db: SqlDb;
  readonly ctx: Ctx;
  readonly settings: AppSettings;
  readonly i18n: I18n;
  /** The dog the app is about (G-09: one dog, no selector). Null before onboarding. */
  readonly dog: Dog | null;
  /** Bumps after every write so screens re-read their data. */
  readonly version: number;
  readonly bump: () => void;
  /** Reads the settings from the database again (after a restore) and redraws. */
  readonly reloadSettings: () => void;
  readonly updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Creates the dog, marks onboarding done and remembers the goals. */
  readonly completeOnboarding: (input: DogInput, goals: AppSettings['goals']) => void;
  /** Creates a demo dog with a fortnight of invented records. */
  readonly startDemo: () => void;
  /** Removes the demo dog and its records and returns to onboarding. */
  readonly removeDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) {
    throw new Error('useApp must be used inside AppProviders');
  }
  return value;
}

/** Keeps the theme provider in step with the saved palette and scheme. */
function ThemeSync({ settings }: { settings: AppSettings }) {
  const { setPalette, setMode } = useTheme();
  useEffect(() => {
    setPalette(settings.palette);
    setMode(settings.scheme);
  }, [settings.palette, settings.scheme, setPalette, setMode]);
  return null;
}

function Providers({ children }: { children: ReactNode }) {
  const { db, ctx } = getRuntime();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = getSettings(db);
    // First launch: follow the phone's language instead of the Russian default.
    return stored.onboardingDone ? stored : { ...stored, language: detectLanguage() };
  });
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSetting(db, ctx, key, value);
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [db, ctx],
  );

  const dog = useMemo(() => {
    return (
      (settings.activeDogId === null ? null : getDog(db, settings.activeDogId)) ??
      listDogs(db)[0] ??
      null
    );
  }, [db, settings.activeDogId, version]);

  const completeOnboarding = useCallback(
    (input: DogInput, goals: AppSettings['goals']) => {
      const created = createDog(db, ctx, input);
      setSetting(db, ctx, 'activeDogId', created.id);
      setSetting(db, ctx, 'goals', goals);
      setSetting(db, ctx, 'language', settings.language);
      setSetting(db, ctx, 'onboardingDone', true);
      setSettings((s) => ({
        ...s,
        activeDogId: created.id,
        goals: [...goals],
        onboardingDone: true,
      }));
      bump();
    },
    [db, ctx, settings.language, bump],
  );

  const reloadSettings = useCallback(() => {
    setSettings(getSettings(db));
    bump();
  }, [db, bump]);

  const startDemo = useCallback(() => {
    const created = createDog(db, ctx, {
      name: settings.language === 'en' ? 'Demo' : 'Демо',
      isDemo: true,
      size: 'small',
    });
    seedDemoData(db, ctx, created.id, settings.language);
    setSetting(db, ctx, 'activeDogId', created.id);
    setSetting(db, ctx, 'language', settings.language);
    setSetting(db, ctx, 'onboardingDone', true);
    setSettings((s) => ({ ...s, activeDogId: created.id, onboardingDone: true }));
    bump();
  }, [db, ctx, settings.language, bump]);

  const removeDemo = useCallback(() => {
    deleteDemoData(db);
    setSetting(db, ctx, 'activeDogId', null);
    setSetting(db, ctx, 'onboardingDone', false);
    setSettings((s) => ({ ...s, activeDogId: null, onboardingDone: false }));
    bump();
  }, [db, ctx, bump]);

  const i18n = useMemo(
    () => createI18n({ locale: settings.language, units: settings.units }),
    [settings.language, settings.units],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      db,
      ctx,
      settings,
      i18n,
      dog,
      version,
      bump,
      updateSetting,
      reloadSettings,
      completeOnboarding,
      startDemo,
      removeDemo,
    }),
    [
      db,
      ctx,
      settings,
      i18n,
      dog,
      version,
      bump,
      updateSetting,
      reloadSettings,
      completeOnboarding,
      startDemo,
      removeDemo,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      <ThemeProvider initialPalette={settings.palette} initialMode={settings.scheme}>
        <ThemeSync settings={settings} />
        <I18nProvider i18n={i18n}>
          <ToastProvider bottomOffset={76 + insets.bottom}>{children}</ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </AppContext.Provider>
  );
}

/** Loads fonts, opens the database, then provides settings, theme, language and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  return (
    <SafeAreaProvider>
      {fontsLoaded ? (
        <Providers>{children}</Providers>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#f6f7f4' }} />
      )}
    </SafeAreaProvider>
  );
}
