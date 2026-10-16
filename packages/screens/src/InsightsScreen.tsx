import { AppText, Button, Card, Chip, Screen, Sheet, Tag, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { CalendarCellModel, CalendarModel } from './calendarModel';
import { InsightCharts, PeriodCompare } from './ChartViews';
import type { ChartModel, CompareModel } from './chartsModel';
import { WalkCalendar } from './CalendarViews';
import type { InsightCardModel, InsightsModel } from './insightsModel';

export interface InsightsScreenProps {
  readonly model: InsightsModel;
  readonly onShowWalks: (card: InsightCardModel) => void;
  readonly onHide: (card: InsightCardModel) => void;
  /** The calendar of the last weeks; absent while it is not ready. */
  readonly calendar?: CalendarModel;
  readonly onDay?: (cell: CalendarCellModel) => void;
  /** The comparison of two periods and the charts; absent while they are not ready. */
  readonly compare?: {
    readonly model: CompareModel;
    readonly days: number;
    readonly onDays: (days: number) => void;
  };
  readonly charts?: readonly ChartModel[];
}

function InsightCard(props: {
  readonly card: InsightCardModel;
  readonly variant: 'stripe' | 'soft';
  readonly onShowWalks: (card: InsightCardModel) => void;
  readonly onHide: (card: InsightCardModel) => void;
}) {
  const i18n = useI18n();
  const { card } = props;
  return (
    <Card variant={props.variant}>
      <AppText weight={600}>{card.title}</AppText>
      <AppText>{card.body}</AppText>
      {card.label === null ? null : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Tag tone="plain" label={card.label} />
        </View>
      )}
      {card.found === null ? null : <AppText variant="muted">{card.found}</AppText>}
      <AppText variant="muted">{card.note}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Chip
          size="sm"
          label={i18n.t('insights.card.show')}
          onPress={() => {
            props.onShowWalks(card);
          }}
        />
        <Chip
          size="sm"
          label={i18n.t('insights.card.hide')}
          onPress={() => {
            props.onHide(card);
          }}
        />
      </View>
    </Card>
  );
}

/**
 * Insights (docs/23, step 3.5): honest statistics in plain words, the facts first, then the
 * patterns that were found, then very preliminary observations, then what something else explains.
 */
export function InsightsScreen({
  model,
  onShowWalks,
  onHide,
  calendar,
  onDay,
  compare,
  charts,
}: InsightsScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <AppText variant="numBig">{i18n.t('tab.insights')}</AppText>
      <AppText variant="muted">{model.status}</AppText>

      {calendar === undefined || calendar.rows.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{i18n.t('calendar.title')}</AppText>
          <Card variant="flat">
            <WalkCalendar model={calendar} onDay={onDay ?? (() => undefined)} />
          </Card>
          <AppText variant="muted">{calendar.legend}</AppText>
        </View>
      )}

      {model.empty === null ? null : (
        <Card variant="soft">
          <AppText weight={600}>{model.empty.title}</AppText>
          <AppText>{model.empty.text}</AppText>
          <AppText variant="muted">{model.empty.hint}</AppText>
        </Card>
      )}

      {model.facts.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{i18n.t('insights.section.facts')}</AppText>
          <Card variant="flat">
            <View style={{ gap: 12 }}>
              {model.facts.map((fact) => (
                <View key={fact.key}>
                  <AppText variant="muted">{fact.label}</AppText>
                  <AppText weight={600}>{fact.value}</AppText>
                </View>
              ))}
            </View>
          </Card>
        </View>
      )}

      {model.cards.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{i18n.t('insights.section.patterns')}</AppText>
          {model.cards.map((card) => (
            <InsightCard
              key={card.key}
              card={card}
              variant="stripe"
              onShowWalks={onShowWalks}
              onHide={onHide}
            />
          ))}
        </View>
      )}

      {model.noCards === null ? null : <AppText variant="muted">{model.noCards}</AppText>}

      {model.prelim.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{i18n.t('insights.section.prelim')}</AppText>
          {model.prelimWarning === null ? null : (
            <AppText variant="muted">{model.prelimWarning}</AppText>
          )}
          {model.prelim.map((card) => (
            <InsightCard
              key={card.key}
              card={card}
              variant="soft"
              onShowWalks={onShowWalks}
              onHide={onHide}
            />
          ))}
        </View>
      )}

      {model.explained.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{i18n.t('insights.section.explained')}</AppText>
          <AppText variant="muted">{model.explainedHint}</AppText>
          {model.explained.map((card) => (
            <InsightCard
              key={card.key}
              card={card}
              variant="soft"
              onShowWalks={onShowWalks}
              onHide={onHide}
            />
          ))}
        </View>
      )}

      {compare === undefined ? null : (
        <PeriodCompare model={compare.model} days={compare.days} onDays={compare.onDays} />
      )}
      {charts === undefined ? null : <InsightCharts charts={charts} />}

      <AppText variant="muted" style={{ marginTop: 8 }}>
        {model.honesty}
      </AppText>
    </Screen>
  );
}

export interface HideSheetProps {
  readonly card: InsightCardModel | null;
  readonly onWeek: () => void;
  readonly onForever: () => void;
  readonly onClose: () => void;
}

/** "Скрыть эту карточку": for a week or for good. */
export function HideInsightSheet({ card, onWeek, onForever, onClose }: HideSheetProps) {
  const i18n = useI18n();
  if (card === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={i18n.t('insights.hide.title')}>
      <AppText variant="muted">{card.title}</AppText>
      <Button label={i18n.t('insights.hide.week')} onPress={onWeek} />
      <Button label={i18n.t('insights.hide.forever')} tone="ghost" onPress={onForever} />
    </Sheet>
  );
}

export interface CardWalkRow {
  readonly key: string;
  /** "12 окт · 42 мин". */
  readonly when: string;
  readonly hit: boolean;
}

export interface CardWalksSheetProps {
  readonly card: InsightCardModel | null;
  readonly rows: readonly CardWalkRow[];
  readonly onClose: () => void;
}

/** "Показать прогулки": the walks of the group, with the ones where the outcome happened marked. */
export function CardWalksSheet({ card, rows, onClose }: CardWalksSheetProps) {
  const i18n = useI18n();
  if (card === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={i18n.t('insights.walks.title')}>
      <AppText weight={600}>{card.title}</AppText>
      <AppText variant="muted">{card.body}</AppText>
      <View style={{ gap: 6, marginTop: 8 }}>
        {rows.map((row) => (
          <AppText key={row.key}>
            {row.when} · {i18n.t(row.hit ? 'insights.walks.hit' : 'insights.walks.miss')}
          </AppText>
        ))}
      </View>
    </Sheet>
  );
}
