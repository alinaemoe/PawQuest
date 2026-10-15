import { Image, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface AvatarProps {
  /** Photo of the dog; the icon is shown when there is none. */
  readonly uri?: string | null;
  readonly icon?: IconName;
  readonly size?: number;
}

/** Round picture with a tinted background; the dog's photo or a paw. Decorative for screen readers. */
export function Avatar({ uri, icon = 'paw', size = 44 }: AvatarProps) {
  const { colors } = useTheme().theme;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri === null || uri === undefined ? (
        <Icon name={icon} color={colors.accent} size={Math.round(size * 0.58)} />
      ) : (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      )}
    </View>
  );
}
