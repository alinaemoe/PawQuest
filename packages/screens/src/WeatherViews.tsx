import { AppText, Card, Sheet, Tag, useI18n } from '@pawquest/rn-ui';
import { Pressable, View } from 'react-native';

import type { WeatherView } from './weatherModel';

export interface WeatherCardProps {
  /** Null while there is nothing to show; then `hint` (if any) explains why, quietly. */
  readonly view: WeatherView | null;
  readonly hint: string | null;
  readonly onPress: () => void;
}

/** Today's weather strip: the temperature and a few factual chips; tap for the details. */
export function WeatherCard({ view, hint, onPress }: WeatherCardProps) {
  const i18n = useI18n();
  if (view === null) {
    return hint === null ? null : (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Card variant="flat">
          <AppText variant="muted">{hint}</AppText>
        </Card>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={i18n.t('weather.title')}
      onPress={onPress}
    >
      <Card variant="flat">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <AppText variant="numBig">{view.temp}</AppText>
          {view.feels === null ? null : <AppText variant="muted">{view.feels}</AppText>}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {view.chips.map((chip) => (
            <Tag key={chip.id} tone={chip.tone} label={chip.text} />
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

export interface WeatherSheetProps {
  readonly view: WeatherView | null;
  readonly onClose: () => void;
}

/** Everything behind the chips, plus a plain note about how far the model point is. */
export function WeatherSheet({ view, onClose }: WeatherSheetProps) {
  const i18n = useI18n();
  if (view === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={i18n.t('weather.title')}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <AppText variant="numBig">{view.temp}</AppText>
        {view.feels === null ? null : <AppText variant="muted">{view.feels}</AppText>}
      </View>
      <View style={{ gap: 8 }}>
        {view.rows.map((row) => (
          <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="muted" style={{ flexShrink: 1 }}>
              {row.label}
            </AppText>
            <AppText style={{ marginLeft: 12 }}>{row.value}</AppText>
          </View>
        ))}
      </View>
      {view.notes.map((note) => (
        <AppText key={note} variant="muted" style={{ fontSize: 12 }}>
          {note}
        </AppText>
      ))}
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {view.footnote}
      </AppText>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {view.updated}
      </AppText>
    </Sheet>
  );
}
