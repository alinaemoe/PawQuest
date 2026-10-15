import { AppText, Button, Card, Chip, Screen, TextField, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

import type { WalkFacts } from './walksModel';

export interface WalkSummaryModel {
  readonly facts: readonly WalkFacts[];
  /** "Собака ×3 · Успех ×2": counts of the events recorded on the walk. */
  readonly eventsLine: string | null;
}

export interface WalkSummaryScreenProps {
  readonly summary: WalkSummaryModel;
  readonly onSave: (result: {
    readonly mood: number | null;
    readonly distraction: number | null;
    readonly notes: string | null;
  }) => void;
}

/** Walk summary (spec S05): the numbers first, then how it went; saving takes one tap. */
export function WalkSummaryScreen({ summary, onSave }: WalkSummaryScreenProps) {
  const i18n = useI18n();
  const [mood, setMood] = useState<number | null>(null);
  const [distraction, setDistraction] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  return (
    <Screen>
      <AppText variant="numBig">{i18n.t('sumw.title')}</AppText>
      <Card variant="soft">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          {summary.facts.map((fact) => (
            <View key={fact.label}>
              <AppText variant="eyebrow">{fact.label}</AppText>
              <AppText variant="numBig" style={{ fontSize: 24 }}>
                {fact.value}
              </AppText>
            </View>
          ))}
        </View>
      </Card>
      {summary.eventsLine === null ? null : (
        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{i18n.t('sumw.events')}</AppText>
          <AppText>{summary.eventsLine}</AppText>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('sumw.mood')}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              label={String(n)}
              selected={mood === n}
              onPress={() => {
                setMood(mood === n ? null : n);
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('sumw.distraction')}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              label={`D${String(n)}`}
              selected={distraction === n}
              onPress={() => {
                setDistraction(distraction === n ? null : n);
              }}
            />
          ))}
        </View>
      </View>
      <TextField label={i18n.t('abc.note')} value={notes} onChangeText={setNotes} multiline />
      <Button
        label={i18n.t('sumw.save')}
        size="lg"
        onPress={() => {
          onSave({ mood, distraction, notes: notes.trim() === '' ? null : notes.trim() });
        }}
      />
    </Screen>
  );
}
