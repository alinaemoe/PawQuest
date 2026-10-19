import type { UnitSystem } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, Tag, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { distanceToMeters, parseMinutes } from './input';
import type { TimelineRow } from './chronologyRows';
import type { UsualModel } from './usualModel';
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
  /** "Дом → Магазин → Парк": the saved places visited, when there were any. */
  readonly route?: string | null;
  /** The walk against walks like it. */
  readonly usual?: UsualModel | null;
  /** What the walk consisted of: visits and legs, for GPS walks. */
  readonly timeline?: readonly TimelineRow[];
  /** The stays in saved places ("Парк · 38 мин · 10:41–11:19"), for GPS walks. */
  readonly zones?: readonly string[];
  readonly manual: boolean;
}

export interface WalkDetailsSheetProps {
  readonly map?: ReactNode;
  /** The pictures of the walk (strip and viewer). */
  readonly photos?: ReactNode;
  /** A tap on a visit row of the timeline (to mark it as spent indoors). */
  readonly onTimelineRow?: (row: TimelineRow) => void;
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
  onTimelineRow,
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
      {walk.usual === undefined || walk.usual === null ? null : (
        <View style={{ gap: 2 }}>
          <AppText variant="eyebrow">{i18n.t('usual.title')}</AppText>
          {walk.usual.lines.map((text) => (
            <AppText key={text}>{text}</AppText>
          ))}
          <AppText variant="muted">{walk.usual.caption}</AppText>
        </View>
      )}
      {walk.weather === undefined || walk.weather === null ? null : (
        <AppText variant="muted">{walk.weather}</AppText>
      )}
      {walk.route === undefined || walk.route === null ? null : (
        <AppText weight={600}>{walk.route}</AppText>
      )}
      {walk.zones === undefined || walk.zones.length === 0 ? null : (
        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{i18n.t('walk.zones')}</AppText>
          {walk.zones.map((line, i) => (
            <AppText key={`${line}-${String(i)}`}>{line}</AppText>
          ))}
        </View>
      )}
      {walk.timeline === undefined || walk.timeline.length === 0 ? null : (
        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{i18n.t('walk.timeline')}</AppText>
          {walk.timeline.map((row) =>
            row.canMark && onTimelineRow !== undefined ? (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={() => {
                  onTimelineRow(row);
                }}
              >
                <AppText>
                  {row.time} · {row.text} · {row.detail} ›
                </AppText>
              </Pressable>
            ) : (
              <AppText
                key={row.key}
                variant="body"
                style={row.kind === 'leg' ? { opacity: 0.65 } : {}}
              >
                {row.time} · {row.text} · {row.detail}
              </AppText>
            ),
          )}
        </View>
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
