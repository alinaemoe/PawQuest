import { createI18n, type Locale } from '@pawquest/i18n';
import {
  AppText,
  Chip,
  I18nProvider,
  ThemeProvider,
  ToastProvider,
  useTheme,
  type SchemeMode,
} from '@pawquest/rn-ui';
import { PALETTE_NAMES, PALETTES, type PaletteName } from '@pawquest/ui';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveWalkScreen } from './src/screens/ActiveWalkScreen';
import { GalleryScreen } from './src/screens/GalleryScreen';
import { MockOnboarding, MockToday } from './src/screens/Mocks';

type ScreenId = 'today' | 'onboarding' | 'active' | 'gallery';

const SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: 'today', label: 'Сегодня (S01)' },
  { id: 'onboarding', label: 'Онбординг (S00)' },
  { id: 'active', label: 'Идёт прогулка (S03)' },
  { id: 'gallery', label: 'Компоненты' },
];

const PALETTE_LABELS: Record<PaletteName, string> = {
  forest: 'Лес',
  sea: 'Море',
  berry: 'Ягода',
  sun: 'Янтарь',
};

const MODES: readonly { id: SchemeMode; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
];

function Swatch({ name }: { name: PaletteName }) {
  const { palette, setPalette, theme } = useTheme();
  const selected = palette === name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Палитра ${PALETTE_LABELS[name]}`}
      accessibilityState={{ selected }}
      onPress={() => {
        setPalette(name);
      }}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: PALETTES[name][theme.scheme],
        borderWidth: 3,
        borderColor: selected ? theme.colors.ink : 'transparent',
      }}
    />
  );
}

function Lab({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  const { theme, mode, setMode } = useTheme();
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<ScreenId>('today');
  const compact = width < 560;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{
          padding: compact ? 0 : 24,
          gap: 20,
          alignItems: 'center',
          flexGrow: 1,
        }}
      >
        {compact ? null : (
          <View style={{ width: '100%', maxWidth: 940, gap: 14 }}>
            <AppText variant="title">PawQuest UI Lab</AppText>
            <AppText variant="muted">
              Экраны на тех же компонентах, что поедут в приложение. Палитра и тема переключаются
              здесь.
            </AppText>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <AppText variant="eyebrow">Акцент</AppText>
              {PALETTE_NAMES.map((name) => (
                <Swatch key={name} name={name} />
              ))}
              <View style={{ width: 16 }} />
              <AppText variant="eyebrow">Язык</AppText>
              {(['ru', 'en'] as const).map((l) => (
                <Chip
                  key={l}
                  label={l.toUpperCase()}
                  selected={locale === l}
                  onPress={() => {
                    setLocale(l);
                  }}
                />
              ))}
              <View style={{ width: 16 }} />
              <AppText variant="eyebrow">Тема</AppText>
              {MODES.map((m) => (
                <Chip
                  key={m.id}
                  label={m.label}
                  selected={mode === m.id}
                  onPress={() => {
                    setMode(m.id);
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <AppText variant="eyebrow">Экран</AppText>
              {SCREENS.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  selected={screen === s.id}
                  onPress={() => {
                    setScreen(s.id);
                  }}
                />
              ))}
            </View>
          </View>
        )}

        <View
          style={{
            width: compact ? '100%' : 400,
            height: compact ? undefined : 800,
            flex: compact ? 1 : undefined,
            borderRadius: compact ? 0 : 38,
            borderWidth: compact ? 0 : 1,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
          }}
        >
          {screen === 'today' ? <MockToday /> : null}
          {screen === 'onboarding' ? <MockOnboarding /> : null}
          {screen === 'active' ? <ActiveWalkScreen /> : null}
          {screen === 'gallery' ? <GalleryScreen /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [locale, setLocale] = useState<Locale>('ru');
  const i18n = useMemo(() => createI18n({ locale, units: 'metric' }), [locale]);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider i18n={i18n}>
          <ToastProvider>
            <Lab locale={locale} setLocale={setLocale} />
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
