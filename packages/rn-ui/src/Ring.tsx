import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export interface RingProps {
  readonly value: number;
  readonly total: number;
  readonly label: string;
  readonly size?: number;
}

/** Progress ring for weekly goals: "2/3" inside, a caption underneath. */
export function Ring({ value, total, label, size = 58 }: RingProps) {
  const { colors } = useTheme().theme;
  const stroke = 6;
  const r = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const fraction = total <= 0 ? 0 : Math.min(1, Math.max(0, value / total));
  const center = size / 2;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${String(value)} / ${String(total)}`}
      style={{ alignItems: 'center', flex: 1, gap: 2 }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
        <Circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={colors.line}
          strokeWidth={stroke}
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${String(circumference * fraction)} ${String(circumference)}`}
          transform={`rotate(-90 ${String(center)} ${String(center)})`}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: size,
          justifyContent: 'center',
        }}
      >
        <AppText variant="mono" weight={600} style={{ textAlign: 'center', fontSize: 13 }}>
          {`${String(value)}/${String(total)}`}
        </AppText>
      </View>
      <AppText variant="muted" style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </AppText>
    </View>
  );
}
