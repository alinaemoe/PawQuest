import type { UnitSystem } from '@pawquest/i18n';
import { AppText, Button, Chip, ListRow, Sheet, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { distanceToMeters, parseMinutes, weightToGrams } from './input';

/** Sheets keep their fields only while open: reopening starts from a clean form. */
function useResetOnOpen(visible: boolean, reset: () => void): void {
  useEffect(() => {
    if (visible) {
      reset();
    }
    // reset only when the sheet opens, not on every render
  }, [visible]);
}

export interface NoteSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSave: (text: string) => void;
}

/** Quick note outside a walk (S01-N): one field, one button. */
export function NoteSheet({ visible, onClose, onSave }: NoteSheetProps) {
  const i18n = useI18n();
  const [text, setText] = useState('');
  useResetOnOpen(visible, () => {
    setText('');
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('note.title')}>
      <TextField
        placeholder={i18n.t('note.placeholder')}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
      />
      <Button
        label={i18n.t('common.save')}
        disabled={text.trim() === ''}
        onPress={() => {
          onSave(text.trim());
        }}
      />
    </Sheet>
  );
}

export interface WeightSheetProps {
  readonly visible: boolean;
  readonly units: UnitSystem;
  readonly onClose: () => void;
  /** Whole grams. */
  readonly onSave: (grams: number) => void;
}

export function WeightSheet({ visible, units, onClose, onSave }: WeightSheetProps) {
  const i18n = useI18n();
  const [text, setText] = useState('');
  useResetOnOpen(visible, () => {
    setText('');
  });
  const grams = weightToGrams(text, units);
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('weight.title')}>
      <TextField
        label={units === 'imperial' ? i18n.t('weight.inputLb') : i18n.t('weight.inputKg')}
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        autoFocus
        maxLength={6}
      />
      <Button
        label={i18n.t('common.save')}
        disabled={grams === null}
        onPress={() => {
          if (grams !== null) {
            onSave(grams);
          }
        }}
      />
    </Sheet>
  );
}

export interface ManualWalk {
  readonly durationMin: number;
  readonly distanceM: number | null;
  /** How long before now the walk ended. */
  readonly endedAgoMs: number;
}

export interface WalkSheetProps {
  readonly visible: boolean;
  readonly units: UnitSystem;
  readonly onClose: () => void;
  readonly onSave: (walk: ManualWalk) => void;
}

const HOUR = 3_600_000;
const ENDED: readonly {
  readonly key: 'walk.endedNow' | 'walk.ended1h' | 'walk.ended3h' | 'walk.endedYesterday';
  readonly ms: number;
}[] = [
  { key: 'walk.endedNow', ms: 0 },
  { key: 'walk.ended1h', ms: HOUR },
  { key: 'walk.ended3h', ms: 3 * HOUR },
  { key: 'walk.endedYesterday', ms: 24 * HOUR },
];
const QUICK_MINUTES: readonly number[] = [15, 30, 45, 60];

/** Log a walk by hand: how long, optionally how far, and when it ended. */
export function WalkSheet({ visible, units, onClose, onSave }: WalkSheetProps) {
  const i18n = useI18n();
  const [minutes, setMinutes] = useState('30');
  const [distance, setDistance] = useState('');
  const [endedAgo, setEndedAgo] = useState(0);
  useResetOnOpen(visible, () => {
    setMinutes('30');
    setDistance('');
    setEndedAgo(0);
  });
  const durationMin = parseMinutes(minutes);
  const distanceM = distanceToMeters(distance, units);
  const distanceInvalid = distance.trim() !== '' && distanceM === null;
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('walk.title')}>
      <View style={{ gap: 8 }}>
        <TextField
          label={i18n.t('walk.minutes')}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          maxLength={4}
        />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_MINUTES.map((m) => (
            <Chip
              key={m}
              size="sm"
              label={`${String(m)} ${i18n.t('unit.min')}`}
              selected={durationMin === m}
              onPress={() => {
                setMinutes(String(m));
              }}
            />
          ))}
        </View>
      </View>
      <TextField
        label={units === 'imperial' ? i18n.t('walk.distanceMi') : i18n.t('walk.distanceKm')}
        value={distance}
        onChangeText={setDistance}
        keyboardType="decimal-pad"
        maxLength={6}
      />
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('walk.ended')}</AppText>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {ENDED.map((e) => (
            <Chip
              key={e.key}
              label={i18n.t(e.key)}
              selected={endedAgo === e.ms}
              onPress={() => {
                setEndedAgo(e.ms);
              }}
            />
          ))}
        </View>
      </View>
      <Button
        label={i18n.t('common.save')}
        disabled={durationMin === null || distanceInvalid}
        onPress={() => {
          if (durationMin !== null && !distanceInvalid) {
            onSave({ durationMin, distanceM, endedAgoMs: endedAgo });
          }
        }}
      />
    </Sheet>
  );
}

export type AddChoice = 'walk' | 'training' | 'observation' | 'weight';

export interface AddSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onChoose: (choice: AddChoice) => void;
}

/** The "+" menu of Today (S01-F). */
export function AddSheet({ visible, onClose, onChoose }: AddSheetProps) {
  const i18n = useI18n();
  const items = [
    { choice: 'walk', icon: 'pin', key: 'fab.walk' },
    { choice: 'training', icon: 'target', key: 'fab.training' },
    { choice: 'observation', icon: 'note', key: 'fab.observation' },
    { choice: 'weight', icon: 'scale', key: 'fab.weight' },
  ] as const;
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('fab.title')}>
      <View>
        {items.map((item, index) => (
          <ListRow
            key={item.choice}
            icon={item.icon}
            title={i18n.t(item.key)}
            divider={index < items.length - 1}
            onPress={() => {
              onChoose(item.choice);
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}
