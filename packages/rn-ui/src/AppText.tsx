import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from './ThemeProvider';
import { fontStyle, type FontWeight } from './typography';

export type TextVariant = 'body' | 'small' | 'muted' | 'title' | 'eyebrow' | 'mono' | 'numBig';

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  /** Overrides the variant's weight. */
  readonly weight?: FontWeight;
  readonly style?: StyleProp<TextStyle>;
}

/** Text with the typography of the approved prototype (Unbounded for titles, Onest for body). */
export function AppText({ variant = 'body', weight, style, ...rest }: AppTextProps) {
  const { colors } = useTheme().theme;
  const variants: Record<TextVariant, TextStyle> = {
    body: { ...fontStyle('body', weight ?? 400), fontSize: 14, lineHeight: 20, color: colors.ink },
    small: {
      ...fontStyle('body', weight ?? 400),
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.ink,
    },
    muted: {
      ...fontStyle('body', weight ?? 400),
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    title: {
      ...fontStyle('display', weight ?? 600),
      fontSize: 15,
      letterSpacing: -0.15,
      color: colors.ink,
    },
    eyebrow: {
      ...fontStyle('body', weight ?? 500),
      fontSize: 11,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: colors.muted,
    },
    mono: {
      ...fontStyle('mono', weight ?? 500),
      fontSize: 14,
      fontVariant: ['tabular-nums'],
      color: colors.ink,
    },
    numBig: {
      ...fontStyle('display', weight ?? 600),
      fontSize: 26,
      letterSpacing: -0.5,
      color: colors.ink,
    },
  };
  return <Text {...rest} style={[variants[variant], style]} />;
}
