import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import type { IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface ListRowProps {
  readonly icon?: IconName;
  /** Any small element in the round icon place (a mark's own shape). */
  readonly iconNode?: ReactNode;
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Shown at the right edge, e.g. a Tag. */
  readonly right?: ReactNode;
  readonly onPress?: () => void;
  /** Draws the hairline under the row (all but the last one). */
  readonly divider?: boolean;
}

/** A record in a list: round icon, two lines of text, optional trailing element. */
export function ListRow({
  icon,
  iconNode,
  title,
  subtitle,
  right,
  onPress,
  divider = true,
}: ListRowProps) {
  const { colors } = useTheme().theme;
  return (
    <Pressable
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={subtitle === undefined ? title : `${title}. ${subtitle}`}
      disabled={onPress === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        minHeight: 56,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {iconNode === undefined ? null : (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {iconNode}
        </View>
      )}
      {icon === undefined ? null : <Avatar icon={icon} size={38} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText numberOfLines={1}>{title}</AppText>
        {subtitle === undefined ? null : (
          <AppText variant="muted" style={{ fontSize: 12.5 }} numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </Pressable>
  );
}
