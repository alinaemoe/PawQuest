import { AppText, Card, Chip, useI18n, useTheme } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { BarModel, ChartModel, CompareModel } from './chartsModel';
import { COMPARE_PRESETS } from './chartsModel';

export interface PeriodCompareProps {
  readonly model: CompareModel;
  readonly days: number;
  readonly onDays: (days: number) => void;
}

/** Two periods side by side: totals, the typical walk, the shares of hard moments and successes. */
export function PeriodCompare({ model, days, onDays }: PeriodCompareProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{i18n.t('compare.title')}</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {COMPARE_PRESETS.map((d) => (
          <Chip
            key={d}
            size="sm"
            label={i18n.t('compare.preset', { n: d })}
            selected={d === days}
            onPress={() => {
              onDays(d);
            }}
          />
        ))}
      </View>
      <Card variant="flat">
        {model.empty ? (
          <AppText variant="muted">{i18n.t('compare.empty')}</AppText>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1.2 }} />
              <AppText variant="muted" style={{ flex: 1, fontSize: 12 }}>
                {model.headerA}
              </AppText>
              <AppText variant="muted" style={{ flex: 1, fontSize: 12 }}>
                {model.headerB}
              </AppText>
            </View>
            {model.rows.map((row) => (
              <View key={row.key} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <AppText style={{ flex: 1.2 }}>{row.title}</AppText>
                  <AppText weight={600} style={{ flex: 1 }}>
                    {row.a}
                  </AppText>
                  <AppText style={{ flex: 1 }}>{row.b}</AppText>
                </View>
                {row.note === null ? null : (
                  <AppText
                    variant="muted"
                    style={{
                      fontSize: 12,
                      color: row.strong ? colors.accent : undefined,
                    }}
                  >
                    {row.note}
                  </AppText>
                )}
              </View>
            ))}
          </View>
        )}
      </Card>
      <AppText variant="muted">{model.caveat}</AppText>
    </View>
  );
}

const BAR_HEIGHT = 12;

function Bar({ bar }: { readonly bar: BarModel }) {
  const { colors } = useTheme().theme;
  const pct = (v: number): `${number}%` => `${Math.round(v * 100)}%`;
  return (
    <View
      accessible
      accessibilityLabel={bar.spoken}
      style={{ gap: 2, opacity: bar.faded ? 0.5 : 1 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <AppText style={{ fontSize: 13, flexShrink: 1 }}>{bar.label}</AppText>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {bar.value}
        </AppText>
      </View>
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: colors.surface2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: pct(bar.end),
            height: BAR_HEIGHT,
            backgroundColor: colors.accent,
          }}
        />
        {bar.part === undefined || bar.part === 0 ? null : (
          <View
            style={{
              position: 'absolute',
              width: pct(bar.part),
              height: BAR_HEIGHT,
              backgroundColor: colors.ink,
              opacity: 0.35,
            }}
          />
        )}
        {bar.whisker === undefined ? null : (
          <View
            style={{
              position: 'absolute',
              left: pct(bar.whisker.from),
              width: pct(Math.max(0.01, bar.whisker.to - bar.whisker.from)),
              top: BAR_HEIGHT / 2 - 1,
              height: 2,
              backgroundColor: colors.ink,
            }}
          />
        )}
      </View>
    </View>
  );
}

export interface InsightChartsProps {
  readonly charts: readonly ChartModel[];
}

/** The three charts: bars with the middle half or the interval, never smoothed curves. */
export function InsightCharts({ charts }: InsightChartsProps) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 16 }}>
      <AppText variant="eyebrow">{i18n.t('charts.title')}</AppText>
      {charts.map((chart) => (
        <Card key={chart.key} variant="flat">
          <View style={{ gap: 8 }}>
            <AppText weight={600}>{chart.title}</AppText>
            {chart.bars.length === 0 ? (
              <AppText variant="muted">{chart.empty}</AppText>
            ) : (
              <View style={{ gap: 8 }}>
                {chart.bars.map((bar) => (
                  <Bar key={bar.key} bar={bar} />
                ))}
              </View>
            )}
            <AppText variant="muted" style={{ fontSize: 12 }}>
              {chart.hint}
            </AppText>
          </View>
        </Card>
      ))}
    </View>
  );
}
