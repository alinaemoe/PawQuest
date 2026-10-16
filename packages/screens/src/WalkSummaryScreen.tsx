import { AppText, Button, Card, Chip, Screen, TextField, useI18n } from '@pawquest/rn-ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { UsualModel } from './usualModel';
import type { WalkFacts } from './walksModel';

export interface WalkSummaryModel {
  readonly facts: readonly WalkFacts[];
  /** "Собака ×3 · Успех ×2": counts of the events recorded on the walk. */
  readonly eventsLine: string | null;
}

export interface WalkSummaryScreenProps {
  readonly map?: ReactNode;
  /** Pictures taken during the walk (a PhotoStrip), shown under the map. */
  readonly photos?: ReactNode;
  readonly summary: WalkSummaryModel;
  /** "Вы часто останавливаетесь здесь. Назвать место?" or "Назвать это место?"; null for none. */
  readonly placeCard?: {
    readonly text: string;
    readonly canDecline: boolean;
    /** The main button; "Назвать" when absent. */
    readonly actionLabel?: string;
  } | null;
  /** "Прогулка должна была закончиться в 12:19": the walk went on after coming to a base. */
  readonly cutCard?: {
    readonly text: string;
    readonly actionLabel: string;
    readonly keepLabel: string;
  } | null;
  /** "По маршруту «До мамы», 5-й раз, на 3 мин дольше обычного": facts only. */
  readonly routeLine?: string | null;
  /** "Как обычно": the walk against walks like it (docs/23, step 3.7). */
  readonly usual?: UsualModel | null;
  /** "Вы часто ходите этим путём. Назвать маршрут?" */
  readonly routeCard?: { readonly text: string; readonly facts: string } | null;
  readonly onRouteName?: () => void;
  readonly onRouteLater?: () => void;
  readonly onRouteNever?: () => void;
  readonly onCut?: () => void;
  readonly onCutKeep?: () => void;
  readonly onPlaceName?: () => void;
  readonly onPlaceLater?: () => void;
  readonly onPlaceNever?: () => void;
  readonly onSave: (result: {
    readonly mood: number | null;
    readonly distraction: number | null;
    readonly notes: string | null;
  }) => void;
}

/** Walk summary (spec S05): the numbers first, then how it went; saving takes one tap. */
export function WalkSummaryScreen(props: WalkSummaryScreenProps) {
  const { summary, onSave } = props;
  const noop = (): void => undefined;
  const i18n = useI18n();
  const [mood, setMood] = useState<number | null>(null);
  const [distraction, setDistraction] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  return (
    <Screen>
      <AppText variant="numBig">{i18n.t('sumw.title')}</AppText>
      {props.map}
      {props.photos}
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
      {props.usual === undefined || props.usual === null ? null : (
        <Card variant="flat">
          <AppText variant="eyebrow">{i18n.t('usual.title')}</AppText>
          {props.usual.lines.map((text) => (
            <AppText key={text}>{text}</AppText>
          ))}
          <AppText variant="muted">{props.usual.caption}</AppText>
        </Card>
      )}
      {props.routeLine === undefined || props.routeLine === null ? null : (
        <AppText variant="muted">{props.routeLine}</AppText>
      )}
      {props.cutCard === undefined || props.cutCard === null ? null : (
        <Card variant="soft">
          <AppText>{props.cutCard.text}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={props.cutCard.actionLabel} onPress={props.onCut ?? noop} />
            <Chip label={props.cutCard.keepLabel} onPress={props.onCutKeep ?? noop} />
          </View>
        </Card>
      )}
      {props.placeCard === undefined || props.placeCard === null ? null : (
        <Card variant="stripe">
          <AppText>{props.placeCard.text}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Chip
              size="sm"
              label={props.placeCard.actionLabel ?? i18n.t('place.suggest.name')}
              onPress={props.onPlaceName ?? noop}
            />
            <Chip
              size="sm"
              label={i18n.t('place.suggest.later')}
              onPress={props.onPlaceLater ?? noop}
            />
            {props.placeCard.canDecline ? (
              <Chip
                size="sm"
                label={i18n.t('place.suggest.never')}
                onPress={props.onPlaceNever ?? noop}
              />
            ) : null}
          </View>
        </Card>
      )}
      {props.routeCard === undefined || props.routeCard === null ? null : (
        <Card variant="stripe">
          <AppText>{props.routeCard.text}</AppText>
          <AppText variant="muted">{props.routeCard.facts}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Chip
              size="sm"
              label={i18n.t('routes.suggestName')}
              onPress={props.onRouteName ?? noop}
            />
            <Chip
              size="sm"
              label={i18n.t('place.suggest.later')}
              onPress={props.onRouteLater ?? noop}
            />
            <Chip
              size="sm"
              label={i18n.t('place.suggest.never')}
              onPress={props.onRouteNever ?? noop}
            />
          </View>
        </Card>
      )}
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
