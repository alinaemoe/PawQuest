import { fonts, metrics } from '@pawquest/ui';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` is the accent color; `ghost` is a quiet secondary button. */
  readonly tone?: 'primary' | 'ghost';
  readonly icon?: IconName;
  /** `lg` is the 72 dp size used for the main action of a screen (G-01). */
  readonly size?: 'md' | 'lg';
  readonly disabled?: boolean;
}

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: size === 'lg' ? metrics.touch.activeWalk : metrics.touch.min,
        borderRadius: size === 'lg' ? 24 : metrics.radius.button,
        paddingHorizontal: 18,
        backgroundColor: primary ? colors.accent : colors.surface2,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon === undefined ? null : (
          <Icon name={icon} color={foreground} size={size === 'lg' ? 30 : 22} />
        )}
        <AppText
          style={{
            color: foreground,
            fontWeight: '600',
            fontSize: size === 'lg' ? 18 : 16,
            fontFamily: size === 'lg' ? fonts.display : fonts.body,
          }}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
