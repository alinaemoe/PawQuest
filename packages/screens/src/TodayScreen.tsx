import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  Icon,
  ListRow,
  Screen,
  Tag,
  Tile,
  useI18n,
  useTheme,
} from '@pawquest/rn-ui';
import { View } from 'react-native';

import { lastWalkLine, type FeedRowModel } from './model';

export interface TodayScreenProps {
  readonly now: number;
  readonly dogName: string;
  readonly dogPhotoUri: string | null;
  /** False until GPS walks exist (Phase 2): the main button then logs a walk by hand. */
  readonly gpsWalks: boolean;
  readonly lastWalk: { readonly startedAt: number; readonly durationS: number | null } | null;
  /** Set when the weight card should show; `title` is already worded. */
  readonly weightCard: { readonly title: string } | null;
  readonly recent: readonly FeedRowModel[];
  /** No records yet: show the "where to start" card instead of an empty feed (G-05). */
  readonly firstRun: boolean;
  readonly onStartWalk: () => void;
  readonly onTraining: () => void;
  readonly onNote: () => void;
  readonly onToilet: () => void;
  readonly onWeightRecord: () => void;
  readonly onWeightLater: () => void;
  readonly onWeightHide: () => void;
  readonly onRecentPress: (row: FeedRowModel) => void;
  readonly onFab: () => void;
}

/** Today (spec S01): what matters now and the one big button. */
export function TodayScreen(props: TodayScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const startLabel = props.gpsWalks ? i18n.t('today.startWalk') : i18n.t('today.logWalk');

  return (
    <Screen fab={{ label: i18n.t('fab.title'), onPress: props.onFab }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={props.dogPhotoUri} size={44} />
        <View style={{ flex: 1 }}>
          <AppText variant="muted" style={{ fontSize: 12 }}>
            {i18n.formatLongDate(props.now)}
          </AppText>
          <AppText variant="title">{i18n.t('today.greeting', { name: props.dogName })}</AppText>
        </View>
      </View>

      <Button label={startLabel} icon="paw" size="hero" onPress={props.onStartWalk} />
      <AppText variant="muted" style={{ marginTop: -4 }}>
        {lastWalkLine(props.lastWalk, i18n, props.now)}
      </AppText>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile icon="target" label={i18n.t('today.tileTraining')} onPress={props.onTraining} />
        <Tile icon="note" label={i18n.t('today.tileNote')} onPress={props.onNote} />
        <Tile icon="drop" label={i18n.t('today.tileToilet')} onPress={props.onToilet} />
      </View>

      {props.weightCard === null ? null : (
        <Card variant="stripe">
          <AppText variant="eyebrow">{props.weightCard.title}</AppText>
          <AppText style={{ marginVertical: 4 }}>{i18n.t('today.weightAsk')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip size="sm" label={i18n.t('today.weightRecord')} onPress={props.onWeightRecord} />
            <Chip size="sm" label={i18n.t('today.weightLater')} onPress={props.onWeightLater} />
            <Chip size="sm" label={i18n.t('today.weightHide')} onPress={props.onWeightHide} />
          </View>
        </Card>
      )}

      {props.firstRun ? (
        <Card variant="flat">
          <AppText variant="eyebrow">{i18n.t('today.firstTitle')}</AppText>
          {(
            [
              ['pin', 'today.firstWalk'],
              ['note', 'today.firstMark'],
              ['scale', 'today.firstWeight'],
            ] as const
          ).map(([icon, key]) => (
            <View
              key={key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
            >
              <Icon name={icon} color={colors.accent} size={20} />
              <AppText>{i18n.t(key)}</AppText>
            </View>
          ))}
        </Card>
      ) : (
        <View>
          <AppText variant="eyebrow" style={{ marginBottom: 4 }}>
            {i18n.t('today.recent')}
          </AppText>
          {props.recent.map((row, index) => (
            <ListRow
              key={row.id}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              divider={index < props.recent.length - 1}
              right={
                row.incomplete ? <Tag tone="warn" label={i18n.t('common.incomplete')} /> : undefined
              }
              onPress={() => {
                props.onRecentPress(row);
              }}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
