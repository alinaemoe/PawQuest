import type { UnitSystem } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, Tag, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { distanceToMeters, parseMinutes } from './input';
import type { WalkFacts } from './walksModel';

export interface WalkDetailsModel {
  readonly id: string;
  /** "Четверг, 15 октября · 14:05" */
  readonly whenText: string;
  readonly facts: readonly WalkFacts[];
  readonly events: readonly { readonly label: string; readonly time: string }[];
  readonly notes: string | null;
  /** Weather saved at the start of the walk, as one line; null when none was saved. */
  readonly weather?: string | null;
  readonly manual: boolean;
}

export interface WalkDetailsSheetProps {
  readonly map?: ReactNode;
  /** The pictures of the walk (strip and viewer). */
  readonly photos?: ReactNode;
  readonly walk: WalkDetailsModel | null;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** One walk: when, the numbers, its events and note; edit and delete (the latter with undo). */
export function WalkDetailsSheet({
  walk,
  map,
  photos,
  onClose,
  onEdit,
  onDelete,
}: WalkDetailsSheetProps) {
  const i18n = useI18n();
  if (walk === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={walk.whenText}>
      {walk.manual ? <Tag tone="plain" label={i18n.t('walk.manual')} /> : null}
      {walk.manual ? null : map}
      {photos}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        {walk.facts.map((fact) => (
          <View key={fact.label}>
            <AppText variant="eyebrow">{fact.label}</AppText>
            <AppText variant="numBig" style={{ fontSize: 22 }}>
              {fact.value}
            </AppText>
          </View>
        ))}
      </View>
      {walk.weather === undefined || walk.weather === null ? null : (
        <AppText variant="muted">{walk.weather}</AppText>
      )}
      <View style={{ gap: 4 }}>
        <AppText variant="eyebrow">{i18n.t('walk.events')}</AppText>
        {walk.events.length === 0 ? (
          <AppText variant="muted">{i18n.t('walk.noEvents')}</AppText>
        ) : (
          walk.events.map((event, index) => (
            <AppText key={`${event.time}-${String(index)}`}>
              {event.time} · {event.label}
            </AppText>
          ))
        )}
      </View>
      {walk.notes === null || walk.notes === '' ? null : (
        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{i18n.t('walk.notes')}</AppText>
          <AppText>{walk.notes}</AppText>
        </View>
      )}
      <Button label={i18n.t('walk.edit')} tone="ghost" icon="edit" onPress={onEdit} />
      <Button label={i18n.t('walk.delete')} tone="ghost" icon="trash" onPress={onDelete} />
    </Sheet>
  );
}

export interface WalkEdit {
  readonly durationMin: number;
  readonly distanceM: number | null;
  readonly notes: string | null;
  readonly mood: number | null;
}

export interface WalkEditSheetProps {
  readonly visible: boolean;
  readonly units: UnitSystem;
  readonly initial: {
    readonly durationMin: number;
    readonly distanceText: string;
    readonly notes: string;
    readonly mood: number | null;
  };
  readonly onClose: () => void;
  readonly onSave: (edit: WalkEdit) => void;
}

/** Fixing a walk after the fact: duration, distance, note and how it went (1-5). */
export function WalkEditSheet({ visible, units, initial, onClose, onSave }: WalkEditSheetProps) {
  const i18n = useI18n();
  const [minutes, setMinutes] = useState(String(initial.durationMin));
  const [distance, setDistance] = useState(initial.distanceText);
  const [notes, setNotes] = useState(initial.notes);
  const [mood, setMood] = useState<number | null>(initial.mood);
  useEffect(() => {
    if (visible) {
      setMinutes(String(initial.durationMin));
      setDistance(initial.distanceText);
      setNotes(initial.notes);
      setMood(initial.mood);
    }
    // refill the form only when the sheet opens
  }, [visible]);
  const durationMin = parseMinutes(minutes);
  const distanceM = distanceToMeters(distance, units);
  const distanceInvalid = distance.trim() !== '' && distanceM === null;
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('walk.editTitle')}>
      <TextField
        label={i18n.t('walk.minutes')}
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
        maxLength={4}
      />
      <TextField
        label={units === 'imperial' ? i18n.t('walk.distanceMi') : i18n.t('walk.distanceKm')}
        value={distance}
        onChangeText={setDistance}
        keyboardType="decimal-pad"
        maxLength={6}
      />
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('abc.note')}</AppText>
        <TextField value={notes} onChangeText={setNotes} multiline />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((m) => (
          <Chip
            key={m}
            label={String(m)}
            selected={mood === m}
            onPress={() => {
              setMood(mood === m ? null : m);
            }}
          />
        ))}
      </View>
      <Button
        label={i18n.t('common.save')}
        disabled={durationMin === null || distanceInvalid}
        onPress={() => {
          if (durationMin !== null && !distanceInvalid) {
            onSave({
              durationMin,
              distanceM,
              notes: notes.trim() === '' ? null : notes.trim(),
              mood,
            });
          }
        }}
      />
    </Sheet>
  );
}
