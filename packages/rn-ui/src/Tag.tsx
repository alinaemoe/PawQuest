import { mix } from '@pawquest/ui';
import { View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

const WARN = '#d9a23a';

export interface TagProps {
  readonly label: string;
  /** `warn` is for things due today; never red, never an alarm (G-19). */
  readonly tone?: 'accent' | 'warn' | 'plain';
}

/** A small rounded label for facts like weather, due dates and states. */
export function Tag({ label, tone = 'accent' }: TagProps) {
  const { colors } = useTheme().theme;
  const background =
    tone === 'warn'
      ? mix(colors.surface, WARN, 0.24)
      : tone === 'plain'
        ? colors.surface2
        : colors.accentSoft;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: background,
      }}
    >
      <AppText style={{ fontSize: 11, lineHeight: 16 }}>{label}</AppText>
    </View>
  );
}
