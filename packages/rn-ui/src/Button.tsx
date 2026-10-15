import { metrics } from '@pawquest/ui';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';
import { fontStyle } from './typography';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` is the accent color; `ghost` is a quiet secondary button. */
  readonly tone?: 'primary' | 'ghost';
  readonly icon?: IconName;
  /** `lg` is the 72 dp size of the Active Walk screen (G-01); `hero` is the 84 dp start button. */
  readonly size?: 'md' | 'lg' | 'hero';
  readonly disabled?: boolean;
}

const SIZES = {
  md: { height: metrics.touch.min, radius: metrics.radius.button, icon: 22, font: 16 },
  lg: { height: metrics.touch.activeWalk, radius: 24, icon: 30, font: 18 },
  hero: { height: 84, radius: 24, icon: 30, font: 18 },
} as const;

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  size = 'md',
  disabled = false,
}: ButtonProps) {
  const { colors } = useTheme().theme;
  const primary = tone === 'primary';
  const foreground = primary ? colors.accentInk : colors.ink;
  const spec = SIZES[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: spec.height,
        borderRadius: spec.radius,
        paddingHorizontal: 18,
        backgroundColor: primary ? colors.accent : colors.surface2,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: size === 'md' ? 10 : 14 }}>
        {icon === undefined ? null : <Icon name={icon} color={foreground} size={spec.icon} />}
        <AppText
          style={{
            ...fontStyle(size === 'md' ? 'body' : 'display', 600),
            color: foreground,
            fontSize: spec.font,
            lineHeight: spec.font + 6,
          }}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
