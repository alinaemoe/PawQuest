import { metrics } from '@pawquest/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from './ThemeProvider';

export interface CardProps {
  readonly children: ReactNode;
  /**
   * `soft`: tinted surface; `flat`: outlined surface; `stripe`: outlined with an accent edge for
   * hints and pattern cards.
   */
  readonly variant?: 'soft' | 'flat' | 'stripe';
}

export function Card({ children, variant = 'soft' }: CardProps) {
  const { colors } = useTheme().theme;
  return (
    <View
      style={{
        borderRadius: metrics.radius.card,
        padding: 14,
        backgroundColor: variant === 'soft' ? colors.surface2 : colors.surface,
        borderWidth: variant === 'soft' ? 0 : 1,
        borderColor: colors.line,
        borderLeftWidth: variant === 'stripe' ? 3 : variant === 'soft' ? 0 : 1,
        borderLeftColor: variant === 'stripe' ? colors.accent : colors.line,
        gap: 4,
      }}
    >
      {children}
    </View>
  );
}
