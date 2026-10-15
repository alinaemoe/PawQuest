import { Platform, type TextStyle } from 'react-native';

export type FontKind = 'body' | 'display' | 'mono';
export type FontWeight = 400 | 500 | 600 | 700;

/**
 * Android registers every face of a custom font under its own family name, and `fontWeight` does
 * not pick between them. The app loads exactly these names (see `NATIVE_FONT_FAMILIES`), the web
 * lab uses the plain family with a CSS weight.
 */
const NATIVE: Readonly<Record<FontKind, Readonly<Record<FontWeight, string>>>> = {
  body: {
    400: 'Onest_400Regular',
    500: 'Onest_500Medium',
    600: 'Onest_600SemiBold',
    700: 'Onest_700Bold',
  },
  display: {
    400: 'Unbounded_400Regular',
    500: 'Unbounded_500Medium',
    600: 'Unbounded_600SemiBold',
    700: 'Unbounded_700Bold',
  },
  mono: {
    400: 'JetBrainsMono_400Regular',
    500: 'JetBrainsMono_500Medium',
    600: 'JetBrainsMono_600SemiBold',
    700: 'JetBrainsMono_700Bold',
  },
};

const WEB: Readonly<Record<FontKind, string>> = {
  body: 'Onest',
  display: 'Unbounded',
  mono: 'JetBrains Mono',
};

/** Every native family name the components may ask for: the host app must register all of them. */
export const NATIVE_FONT_FAMILIES: readonly string[] = Object.values(NATIVE).flatMap((faces) =>
  Object.values(faces),
);

export function fontStyle(kind: FontKind, weight: FontWeight = 400): TextStyle {
  if (Platform.OS === 'web') {
    return { fontFamily: WEB[kind], fontWeight: String(weight) as TextStyle['fontWeight'] };
  }
  return { fontFamily: NATIVE[kind][weight] };
}
