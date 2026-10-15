import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, SwitchRow, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export const PLACE_KINDS = ['park', 'meadow', 'yard', 'district', 'forest', 'waterfront'] as const;

export interface PreWalkChoice {
  readonly gps: boolean;
  readonly placeKind: string | null;
}

export interface PreWalkSheetProps {
  readonly visible: boolean;
  /** The place kind of the previous walk, preselected (G-17). */
  readonly lastPlaceKind: string | null;
  /** A note under the button: location refused, or background recording not allowed. */
  readonly note: string | null;
  /** "8° · Мокро · …" from the weather at the dog's position; null when unknown. */
  readonly weatherLine?: string | null;
  readonly onClose: () => void;
  readonly onStart: (choice: PreWalkChoice) => void;
}

/** Pre-walk (spec S02): everything is preselected, so the walk starts with a single tap on "Start". */
export function PreWalkSheet({
  visible,
  lastPlaceKind,
  note,
  weatherLine = null,
  onClose,
  onStart,
}: PreWalkSheetProps) {
  const i18n = useI18n();
  const [gps, setGps] = useState(true);
  const [placeKind, setPlaceKind] = useState<string | null>(lastPlaceKind);
  useEffect(() => {
    if (visible) {
      setGps(true);
      setPlaceKind(lastPlaceKind);
    }
    // reset only when the sheet opens
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('pre.title')}>
      {weatherLine === null ? null : (
        <AppText variant="muted">{i18n.t('weather.prewalk', { line: weatherLine })}</AppText>
      )}
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('pre.where')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PLACE_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={i18n.t(`place.${kind}` as MessageKey)}
              selected={placeKind === kind}
              onPress={() => {
                setPlaceKind(placeKind === kind ? null : kind);
              }}
            />
          ))}
        </View>
      </View>
      <SwitchRow label={i18n.t('pre.gpsToggle')} value={gps} onValueChange={setGps} />
      {note === null ? null : <AppText variant="muted">{note}</AppText>}
      <Button
        label={i18n.t('pre.start')}
        icon="paw"
        size="lg"
        onPress={() => {
          onStart({ gps, placeKind });
        }}
      />
    </Sheet>
  );
}

export interface RecoverSheetProps {
  readonly visible: boolean;
  /** "14 мин" and the start time, already worded. */
  readonly description: string;
  readonly onContinue: () => void;
  readonly onFinish: () => void;
  readonly onDiscard: () => void;
}

/** An unfinished walk found at startup (spec 4.1): continue, finish at the last point, or delete. */
export function RecoverSheet({
  visible,
  description,
  onContinue,
  onFinish,
  onDiscard,
}: RecoverSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet visible={visible} onClose={onContinue} title={i18n.t('recover.title')}>
      <AppText>{description}</AppText>
      <Button label={i18n.t('recover.continue')} icon="play" onPress={onContinue} />
      <Button label={i18n.t('recover.finish')} tone="ghost" icon="stop" onPress={onFinish} />
      <Button label={i18n.t('recover.discard')} tone="ghost" icon="trash" onPress={onDiscard} />
    </Sheet>
  );
}
