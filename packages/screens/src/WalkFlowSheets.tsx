import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, SwitchRow, useI18n } from '@pawquest/rn-ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

export const PLACE_KINDS = ['park', 'meadow', 'yard', 'district', 'forest', 'waterfront'] as const;

export interface PreWalkChoice {
  readonly gps: boolean;
  /** Only a type ("Луг"), when no saved place is chosen. */
  readonly placeKind: string | null;
  /** A saved place from the library. */
  readonly placeId: string | null;
}

export interface PlaceChip {
  readonly id: string;
  readonly name: string;
}

export interface PreWalkSheetProps {
  readonly visible: boolean;
  /** The place kind of the previous walk, preselected (G-17). */
  readonly lastPlaceKind: string | null;
  /** A note under the button: location refused, or background recording not allowed. */
  readonly note: string | null;
  /** "8° · Мокро · …" from the weather at the dog's position; null when unknown. */
  readonly weatherLine?: string | null;
  /** The saved place the dog is in right now ("Вы здесь: Парк у дома?"), preselected. */
  readonly suggested?: PlaceChip | null;
  /** The most visited and most recent saved places. */
  readonly places?: readonly PlaceChip[];
  /** A place just created from "+ Новое место": becomes the choice. */
  readonly pickedPlaceId?: string | null;
  readonly onNewPlace?: () => void;
  readonly onClose: () => void;
  readonly onStart: (choice: PreWalkChoice) => void;
}

/** Pre-walk (spec S02): everything is preselected, so the walk starts with a single tap on "Start". */
export function PreWalkSheet({
  visible,
  lastPlaceKind,
  note,
  weatherLine = null,
  suggested = null,
  places = [],
  pickedPlaceId = null,
  onNewPlace,
  onClose,
  onStart,
}: PreWalkSheetProps) {
  const i18n = useI18n();
  const [gps, setGps] = useState(true);
  const [placeKind, setPlaceKind] = useState<string | null>(lastPlaceKind);
  const [placeId, setPlaceId] = useState<string | null>(suggested?.id ?? null);
  const touched = useRef(false);
  useEffect(() => {
    if (visible) {
      touched.current = false;
      setGps(true);
      setPlaceId(suggested?.id ?? null);
      setPlaceKind(suggested === null ? lastPlaceKind : null);
    }
    // reset only when the sheet opens
  }, [visible]);
  // the position arrives after the sheet opens: preselect the place unless the owner already chose
  useEffect(() => {
    if (suggested !== null && !touched.current) {
      setPlaceId(suggested.id);
      setPlaceKind(null);
    }
  }, [suggested?.id]);
  useEffect(() => {
    if (pickedPlaceId !== null) {
      setPlaceId(pickedPlaceId);
      setPlaceKind(null);
    }
  }, [pickedPlaceId]);
  const chosen = (id: string): void => {
    touched.current = true;
    setPlaceId(placeId === id ? null : id);
    setPlaceKind(null);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('pre.title')}>
      {weatherLine === null ? null : (
        <AppText variant="muted">{i18n.t('weather.prewalk', { line: weatherLine })}</AppText>
      )}
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('pre.where')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggested === null ? null : (
            <Chip
              label={i18n.t('pre.suggest', { name: suggested.name })}
              selected={placeId === suggested.id}
              onPress={() => {
                chosen(suggested.id);
              }}
            />
          )}
          {places
            .filter((p) => p.id !== suggested?.id)
            .map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={placeId === p.id}
                onPress={() => {
                  chosen(p.id);
                }}
              />
            ))}
          {PLACE_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={i18n.t(`place.${kind}` as MessageKey)}
              selected={placeKind === kind}
              onPress={() => {
                touched.current = true;
                setPlaceKind(placeKind === kind ? null : kind);
                setPlaceId(null);
              }}
            />
          ))}
          {onNewPlace === undefined ? null : (
            <Chip label={`+ ${i18n.t('places.add')}`} onPress={onNewPlace} />
          )}
        </View>
      </View>
      <SwitchRow label={i18n.t('pre.gpsToggle')} value={gps} onValueChange={setGps} />
      {note === null ? null : <AppText variant="muted">{note}</AppText>}
      <Button
        label={i18n.t('pre.start')}
        icon="paw"
        size="lg"
        onPress={() => {
          onStart({ gps, placeKind, placeId });
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
