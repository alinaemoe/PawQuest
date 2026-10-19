import { metrics } from '@pawquest/ui';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface ChipProps {
  /** The text; for a chip with only an icon it is the reading for the screen reader. */
  readonly label: string;
  readonly icon?: IconName;
  /** An icon before the text. */
  readonly lead?: IconName;
  /** A small count after the text; a chip with a zero count is faded unless it is selected. */
  readonly badge?: number;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly size?: 'sm' | 'md';
}

/** A pill for choices and filters. The selected state is a tinted fill plus an accent border. */
export function Chip({
  label,
  icon,
  lead,
  badge,
  selected = false,
  onPress,
  size = 'md',
}: ChipProps) {
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
        alignItems: 'center',
        opacity: badge === 0 && !selected ? 0.45 : 1,
      }}
    >
      {icon === undefined ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {lead === undefined ? null : (
            <Icon
              name={lead}
              color={selected ? colors.accent : colors.muted}
              size={size === 'sm' ? 14 : 16}
            />
          )}
          <AppText style={{ fontSize: size === 'sm' ? 12 : 13 }}>{label}</AppText>
          {badge === undefined ? null : (
            <AppText
              variant="muted"
              style={{
                fontSize: size === 'sm' ? 11 : 12,
                color: selected ? colors.accent : undefined,
              }}
            >
              {badge}
            </AppText>
          )}
        </View>
      ) : (
        <Icon name={icon} color={colors.ink} size={size === 'sm' ? 16 : 20} />
      )}
    </Pressable>
  );
}
