import { AppText, Button, Card, Chip, ListRow, Screen, Tag, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { PlanCardModel } from './healthModel';

export interface VisitRowModel {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export type QuickMark = 'deworm' | 'tick' | 'vaccine';

export interface HealthScreenProps {
  readonly cards: readonly PlanCardModel[];
  readonly visits: readonly VisitRowModel[];
  readonly stats: readonly string[];
  readonly onBack: () => void;
  readonly onDone: (planId: string) => void;
  readonly onSetup: () => void;
  readonly onQuick: (mark: QuickMark) => void;
  readonly onVisit: () => void;
}

/** Health (docs/17 S17-H): what is coming up, quick marks, vet visits, plain facts. */
export function HealthScreen(props: HealthScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('health.title')}</AppText>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {i18n.t('health.disclaimer')}
      </AppText>

      {props.cards.length === 0 ? (
        <Card variant="stripe">
          <AppText variant="eyebrow">{i18n.t('health.setupTitle')}</AppText>
          <AppText style={{ marginVertical: 6 }}>{i18n.t('health.setupText')}</AppText>
          <Button label={i18n.t('health.setup')} onPress={props.onSetup} />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <AppText variant="eyebrow">{i18n.t('health.upcoming')}</AppText>
            <Chip size="sm" label={i18n.t('health.plans')} onPress={props.onSetup} />
          </View>
          {props.cards.map((card) => (
            <Card key={card.planId} variant="flat">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AppText weight={600} style={{ flex: 1, fontSize: 16 }}>
                  {card.title}
                </AppText>
                <Tag
                  tone={
                    card.status === 'overdue'
                      ? 'warn'
                      : card.status === 'unmarked'
                        ? 'plain'
                        : 'accent'
                  }
                  label={card.statusText}
                />
              </View>
              <AppText variant="muted">{card.intervalText}</AppText>
              {card.lastText === null ? null : (
                <AppText variant="muted">
                  {[card.lastText, card.product].filter((p): p is string => p !== null).join(' · ')}
                </AppText>
              )}
              <View style={{ marginTop: 8 }}>
                <Button
                  label={i18n.t('health.done')}
                  icon="check"
                  tone={card.status === 'overdue' || card.status === 'today' ? 'primary' : 'ghost'}
                  onPress={() => {
                    props.onDone(card.planId);
                  }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip
          label={i18n.t('health.quickDeworm')}
          onPress={() => {
            props.onQuick('deworm');
          }}
        />
        <Chip
          label={i18n.t('health.quickTick')}
          onPress={() => {
            props.onQuick('tick');
          }}
        />
        <Chip
          label={i18n.t('health.quickVaccine')}
          onPress={() => {
            props.onQuick('vaccine');
          }}
        />
        <Chip label={`+ ${i18n.t('health.quickVisit')}`} onPress={props.onVisit} />
      </View>

      {props.visits.length === 0 ? null : (
        <View>
          <AppText variant="eyebrow" style={{ marginBottom: 2 }}>
            {i18n.t('visit.recent')}
          </AppText>
          {props.visits.map((visit, index) => (
            <ListRow
              key={visit.id}
              icon="heart"
              title={visit.title}
              subtitle={visit.subtitle}
              divider={index < props.visits.length - 1}
            />
          ))}
        </View>
      )}

      {props.stats.length === 0 ? null : (
        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{i18n.t('health.stats')}</AppText>
          {props.stats.map((line) => (
            <AppText key={line}>{line}</AppText>
          ))}
        </View>
      )}
    </Screen>
  );
}
