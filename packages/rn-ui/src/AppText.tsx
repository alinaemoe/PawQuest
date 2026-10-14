import { fonts } from '@pawquest/ui';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from './ThemeProvider';

export type TextVariant = 'body' | 'small' | 'muted' | 'title' | 'eyebrow' | 'mono' | 'numBig';

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  readonly style?: StyleProp<TextStyle>;
}

/** Text with the typography of the approved prototype (Unbounded for titles, Onest for body). */
export function AppText({ variant = 'body', style, ...rest }: AppTextProps) {
  const { colors } = useTheme().theme;
  const variants: Record<TextVariant, TextStyle> = {
    body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink },
    small: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.ink },
    muted: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
    title: {
      fontFamily: fonts.display,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.15,
      color: colors.ink,
    },
    eyebrow: {
      fontFamily: fonts.body,
      fontSize: 11,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: colors.muted,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
      color: colors.ink,
    },
    numBig: {
      fontFamily: fonts.display,
      fontSize: 26,
      fontWeight: '600',
      letterSpacing: -0.5,
      color: colors.ink,
    },
  };
  return <Text {...rest} style={[variants[variant], style]} />;
}
