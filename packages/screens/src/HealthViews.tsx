import { AppText, Card, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import { ChartBar, InsightCharts } from './ChartViews';
import type { HealthStatsModel } from './healthStatsModel';

export interface HealthSectionProps {
  readonly model: HealthStatsModel;
}

/** Weight, activity by week, walks that stood out, the busiest days: what was recorded, nothing more. */
export function HealthSection({ model }: HealthSectionProps) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 16 }}>
      <AppText variant="muted">{i18n.t('health.stats.hint')}</AppText>

      <Card variant="flat">
        <View style={{ gap: 8 }}>
          <AppText weight={600}>{i18n.t('health.stats.weight')}</AppText>
          {model.weight === null ? (
            <AppText variant="muted">{i18n.t('health.stats.noWeight')}</AppText>
          ) : (
            <>
              <AppText variant="numBig">{model.weight.value}</AppText>
              {model.weight.lines.map((line) => (
                <AppText key={line}>{line}</AppText>
              ))}
              {model.weight.bars.length < 2 ? null : (
                <View style={{ gap: 8, marginTop: 4 }}>
                  {model.weight.bars.map((bar) => (
                    <ChartBar key={bar.key} bar={bar} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </Card>

      <InsightCharts charts={[model.activity]} heading={i18n.t('health.stats.activityHeading')} />

      <Card variant="flat">
        <View style={{ gap: 8 }}>
          <AppText weight={600}>{i18n.t('health.stats.unusual')}</AppText>
          {model.unusual.lines.length === 0 ? (
            <AppText variant="muted">{i18n.t('health.stats.noUnusual')}</AppText>
          ) : (
            model.unusual.lines.map((line) => <AppText key={line}>{line}</AppText>)
          )}
          {model.unusual.note === null ? null : (
            <AppText variant="muted">{model.unusual.note}</AppText>
          )}
        </View>
      </Card>

      {model.busy.length === 0 ? null : (
        <Card variant="flat">
          <View style={{ gap: 6 }}>
            <AppText weight={600}>{i18n.t('health.stats.busy')}</AppText>
            <AppText variant="muted">{i18n.t('health.stats.busyHint')}</AppText>
            {model.busy.map((day) => (
              <AppText key={day}>{day}</AppText>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}
