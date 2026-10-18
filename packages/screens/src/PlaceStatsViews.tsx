import { AppText, Card, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChartBar } from './ChartViews';
import type { StatCardModel } from './placeStatsModel';

export interface StatCardsProps {
  readonly cards: readonly StatCardModel[];
  readonly hint: string;
  readonly empty: string;
  /** The heading over the weeks of an opened card. */
  readonly weeksTitle: string;
}

/** Cards that open into weeks: the places walked in, the skills practised. */
export function StatCards({ cards, hint, empty, weeksTitle }: StatCardsProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (cards.length === 0) {
    return (
      <Card variant="soft">
        <AppText>{empty}</AppText>
      </Card>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="muted">{hint}</AppText>
      {cards.map((card) => {
        const expanded = open === card.id;
        return (
          <Card key={card.id} variant="flat">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${card.title}. ${card.subtitle}`}
              onPress={() => {
                setOpen(expanded ? null : card.id);
              }}
              style={{ gap: 2, opacity: card.enough ? 1 : 0.75 }}
            >
              <AppText weight={600}>{card.title}</AppText>
              <AppText>{card.subtitle}</AppText>
              <AppText variant="muted">{card.footnote}</AppText>
              {card.note === null ? null : <AppText>{card.note}</AppText>}
            </Pressable>
            {expanded ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <AppText variant="eyebrow">{weeksTitle}</AppText>
                {card.bars.map((bar) => (
                  <ChartBar key={bar.key} bar={bar} />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

export interface PlacesSectionProps {
  readonly cards: readonly StatCardModel[];
}

/** The places walked in, the most visited first; a tap opens the weeks of a place. */
export function PlacesSection({ cards }: PlacesSectionProps) {
  const i18n = useI18n();
  return (
    <StatCards
      cards={cards}
      hint={i18n.t('places.stats.hint')}
      empty={i18n.t('places.stats.empty')}
      weeksTitle={i18n.t('places.stats.weeks')}
    />
  );
}

export interface SkillsSectionProps {
  readonly cards: readonly StatCardModel[];
}

/** The skills practised: how it is going, week by week; no bar to reach. */
export function SkillsSection({ cards }: SkillsSectionProps) {
  const i18n = useI18n();
  return (
    <StatCards
      cards={cards}
      hint={i18n.t('skills.stats.hint')}
      empty={i18n.t('skills.stats.empty')}
      weeksTitle={i18n.t('skills.stats.weeks')}
    />
  );
}
