import { metrics, type EventColors } from '@pawquest/ui';
import { Pressable, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export type EventKind = keyof EventColors;

/** Marker shapes: color is never the only signal (docs/03 G-12). */
function shapeXml(kind: EventKind, color: string): string {
  const shapes: Record<EventKind, string> = {
    dog: '<circle cx="12" cy="12" r="9"/>',
    person: '<circle cx="12" cy="12" r="9"/>',
    animal: '<circle cx="12" cy="12" r="9"/>',
    child: '<path d="M12 3l10 18H2z"/>',
    ok: '<path d="M12 2l3 7 7 .8-5.3 4.7 1.6 7.2L12 18l-6.3 3.7 1.6-7.2L2 9.8 9 9z"/>',
    hard: '<path d="M12 2l10 10-10 10L2 12z"/>',
    ex: '<rect x="3" y="3" width="18" height="18" rx="3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="${color}">${shapes[kind]}</svg>`;
}

/** Just the shape and color of a mark (what the owner sees on its button and on the map). */
export function MarkShape({ kind, size = 24 }: { kind: EventKind; size?: number }) {
  const { colors } = useTheme().theme;
  return <SvgXml xml={shapeXml(kind, colors.events[kind])} width={size} height={size} />;
}

export interface EventButtonProps {
  readonly kind: EventKind;
  readonly label: string;
  /** How many times the event was recorded on this walk; shown in the corner when above 0. */
  readonly count?: number;
  /** Tap: record the event right away. */
  readonly onPress: () => void;
  /** Long press (400 ms): open the details sheet. */
  readonly onLongPress?: () => void;
}

/** One of the quick-event buttons of the Active Walk screen (spec S03-E). */
export function EventButton({ kind, label, count = 0, onPress, onLongPress }: EventButtonProps) {
  const { colors } = useTheme().theme;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, записано ${String(count)}` : label}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        paddingHorizontal: 6,
        paddingVertical: 8,
        borderRadius: metrics.radius.event,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.surface2 : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      })}
    >
      <SvgXml xml={shapeXml(kind, colors.events[kind])} width={24} height={24} />
      {/* a long label ("Сложный момент") shrinks a little or takes two centered lines, and does not follow a huge system font */}
      <AppText
        weight={600}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.15}
        style={{ fontSize: 13, lineHeight: 16, textAlign: 'center' }}
      >
        {label}
      </AppText>
      {count > 0 ? (
        <View style={{ position: 'absolute', top: 6, right: 10 }}>
          <AppText variant="mono" style={{ fontSize: 12, color: colors.muted }}>
            {String(count)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
