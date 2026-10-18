import { AppText, Card, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChartBar } from './ChartViews';
import type { PlaceCardModel } from './placeStatsModel';

export interface PlacesSectionProps {
  readonly cards: readonly PlaceCardModel[];
}

/** The places walked in, the most visited first; a tap opens the weeks of a place. */
export function PlacesSection({ cards }: PlacesSectionProps) {
  const i18n = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  if (cards.length === 0) {
    return (
      <Card variant="soft">
        <AppText>{i18n.t('places.stats.empty')}</AppText>
      </Card>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="muted">{i18n.t('places.stats.hint')}</AppText>
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
            </Pressable>
            {expanded ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <AppText variant="eyebrow">{i18n.t('places.stats.weeks')}</AppText>
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
