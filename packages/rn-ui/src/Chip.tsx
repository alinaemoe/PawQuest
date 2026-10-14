import { metrics } from '@pawquest/ui';
import { Pressable } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly size?: 'sm' | 'md';
}

/** A pill for choices and filters. The selected state is a tinted fill plus an accent border. */
export function Chip({ label, selected = false, onPress, size = 'md' }: ChipProps) {
  const { colors } = useTheme().theme;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: size === 'sm' ? 30 : 36,
        paddingHorizontal: size === 'sm' ? 10 : 12,
        borderRadius: metrics.radius.chip,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.line,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        justifyContent: 'center',
      }}
    >
      <AppText style={{ fontSize: size === 'sm' ? 12 : 13 }}>{label}</AppText>
    </Pressable>
  );
}
