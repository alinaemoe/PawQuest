import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';

export interface TabItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly icon: IconName;
  /** Small dot or count, e.g. unfinished observations. */
  readonly badge?: number;
}

export interface TabBarProps<Id extends string> {
  readonly tabs: readonly TabItem<Id>[];
  readonly active: Id;
  readonly onSelect: (id: Id) => void;
}

/** Bottom navigation: five fixed tabs, the active one in the accent color (spec 3.2). */
export function TabBar<Id extends string>({ tabs, active, onSelect }: TabBarProps<Id>) {
  const { colors } = useTheme().theme;
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
        paddingTop: 6,
        paddingHorizontal: 6,
        paddingBottom: 8 + insets.bottom,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const color = selected ? colors.accent : colors.muted;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => {
              onSelect(tab.id);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, minHeight: 48 }}
          >
            <View>
              <Icon name={tab.icon} color={color} size={22} />
              {tab.badge === undefined || tab.badge <= 0 ? null : (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -6,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: colors.events.ok,
                  }}
                />
              )}
            </View>
            <AppText weight={selected ? 600 : 400} style={{ fontSize: 11, lineHeight: 14, color }}>
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
