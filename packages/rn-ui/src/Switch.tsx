import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export interface SwitchRowProps {
  readonly label: string;
  readonly hint?: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
}

/** A labelled on/off row; the whole row is the touch target. */
export function SwitchRow({ label, hint, value, onValueChange }: SwitchRowProps) {
  const { colors } = useTheme().theme;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        onValueChange(!value);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingVertical: 6,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
        {hint === undefined ? null : (
          <AppText variant="muted" style={{ fontSize: 12.5 }}>
            {hint}
          </AppText>
        )}
      </View>
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          backgroundColor: value ? colors.accent : colors.line,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: value ? 21 : 3,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: value ? colors.accentInk : colors.surface,
          }}
        />
      </View>
    </Pressable>
  );
}
