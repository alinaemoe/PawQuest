import { buildTheme, type PaletteName, type Scheme, type Theme } from '@pawquest/ui';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/** The scheme the user chose: follow the system (default), or force light or dark. */
export type SchemeMode = 'system' | Scheme;

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly palette: PaletteName;
  readonly mode: SchemeMode;
  readonly setPalette: (palette: PaletteName) => void;
  readonly setMode: (mode: SchemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly initialPalette?: PaletteName;
  readonly initialMode?: SchemeMode;
}

/**
 * Provides the current theme (palette x light/dark) to all components. The palette and the scheme
 * mode are per-device preferences; persisting them is the host app's job.
 */
export function ThemeProvider({
  children,
  initialPalette = 'forest',
  initialMode = 'system',
}: ThemeProviderProps) {
  const [palette, setPalette] = useState<PaletteName>(initialPalette);
  const [mode, setMode] = useState<SchemeMode>(initialMode);
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: Scheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
    return { theme: buildTheme(palette, scheme), palette, mode, setPalette, setMode };
  }, [palette, mode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** @throws Error when used outside a ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
