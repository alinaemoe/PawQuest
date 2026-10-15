import { AppText, Avatar, Button, Card, ListRow, Screen, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { DayGroup } from './walksModel';

export interface WalksScreenProps {
  /** "5 прогулок · 3 ч 40 мин · 12 км" for the last 7 days, null when there are no walks. */
  readonly weekLine: string | null;
  readonly groups: readonly DayGroup[];
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
  readonly onOpen: (walkId: string) => void;
  readonly onLogWalk: () => void;
}

/** The Walks tab (spec S06): totals of the week and the history grouped by day. */
export function WalksScreen({
  weekLine,
  groups,
  hasMore,
  onLoadMore,
  onOpen,
  onLogWalk,
}: WalksScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <AppText variant="numBig">{i18n.t('walks.title')}</AppText>

      {groups.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 36 }}>
          <Avatar icon="pin" size={88} />
          <AppText variant="title">{i18n.t('walks.emptyTitle')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('walks.emptyText')}
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Button label={i18n.t('today.logWalk')} icon="plus" size="lg" onPress={onLogWalk} />
          </View>
        </View>
      ) : (
        <>
          {weekLine === null ? null : (
            <Card variant="stripe">
              <AppText variant="eyebrow">{i18n.t('walks.week')}</AppText>
              <AppText weight={600} style={{ fontSize: 16 }}>
                {weekLine}
              </AppText>
            </Card>
          )}
          {groups.map((group) => (
            <View key={group.label}>
              <AppText variant="eyebrow" style={{ marginBottom: 2 }}>
                {group.label}
              </AppText>
              {group.walks.map((walk, index) => (
                <ListRow
                  key={walk.id}
                  icon="pin"
                  title={`${walk.time} · ${walk.summary}`}
                  subtitle={walk.detail === '' ? undefined : walk.detail}
                  divider={index < group.walks.length - 1}
                  onPress={() => {
                    onOpen(walk.id);
                  }}
                />
              ))}
            </View>
          ))}
          {hasMore ? (
            <Button label={i18n.t('walks.loadMore')} tone="ghost" onPress={onLoadMore} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
