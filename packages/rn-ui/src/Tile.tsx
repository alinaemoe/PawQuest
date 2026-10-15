import { Pressable } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface TileProps {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
}

/** A square quick-action button of the Today screen: icon over a short label. */
export function Tile({ icon, label, onPress, onLongPress }: TileProps) {
  const { colors } = useTheme().theme;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 76,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.surface2 : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 6,
      })}
    >
      <Icon name={icon} color={colors.accent} size={24} />
      <AppText style={{ fontSize: 12.5, lineHeight: 16, textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}
