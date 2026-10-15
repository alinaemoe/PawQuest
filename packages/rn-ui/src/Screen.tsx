import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';

export interface ScreenProps {
  readonly children: ReactNode;
  /** A floating "+" button in the corner (Today, S01-F). */
  readonly fab?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly onLongPress?: () => void;
  };
  /** Extra space under the content, e.g. to clear the tab bar overlay. */
  readonly bottomPadding?: number;
}

/**
 * The scrolling page every tab uses: background, status-bar inset, 16 dp gutters, 12 dp rhythm
 * between blocks (the prototype's `.stack`), and an optional floating action button.
 */
export function Screen({ children, fab, bottomPadding = 24 }: ScreenProps) {
  const { colors } = useTheme().theme;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: bottomPadding + (fab === undefined ? 0 : 64),
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {fab === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fab.label}
          onPress={fab.onPress}
          onLongPress={fab.onLongPress}
          style={({ pressed }) => ({
            position: 'absolute',
            right: 16,
            bottom: 16,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          })}
        >
          <Icon name="plus" color={colors.accentInk} size={26} />
        </Pressable>
      )}
    </View>
  );
}
