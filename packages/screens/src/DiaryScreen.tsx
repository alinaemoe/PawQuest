import { AppText, Avatar, Button, Chip, ListRow, Screen, Tag, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { DiaryGroup } from './diaryModel';

export type DiaryFilterId = 'all' | 'incomplete';

export interface DiaryScreenProps {
  readonly groups: readonly DiaryGroup[];
  readonly filter: DiaryFilterId;
  readonly hasMore: boolean;
  readonly onFilter: (filter: DiaryFilterId) => void;
  readonly onLoadMore: () => void;
  readonly onOpen: (id: string) => void;
  readonly onNew: () => void;
  readonly onBack: () => void;
}

/** The behavior diary (spec S12-L): observations by day, with a "can be completed" filter. */
export function DiaryScreen(props: DiaryScreenProps) {
  const i18n = useI18n();
  return (
    <Screen fab={{ label: i18n.t('diary.new'), onPress: props.onNew }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('diary.title')}</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip
          label={i18n.t('diary.filterAll')}
          selected={props.filter === 'all'}
          onPress={() => {
            props.onFilter('all');
          }}
        />
        <Chip
          label={i18n.t('diary.filterIncomplete')}
          selected={props.filter === 'incomplete'}
          onPress={() => {
            props.onFilter('incomplete');
          }}
        />
      </View>

      {props.groups.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 36 }}>
          <Avatar icon="note" size={88} />
          <AppText variant="title">{i18n.t('diary.emptyTitle')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('diary.emptyText')}
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Button label={i18n.t('diary.new')} icon="plus" size="lg" onPress={props.onNew} />
          </View>
        </View>
      ) : (
        <>
          {props.groups.map((group) => (
            <View key={group.label}>
              <AppText variant="eyebrow" style={{ marginBottom: 2 }}>
                {group.label}
              </AppText>
              {group.rows.map((row, index) => (
                <ListRow
                  key={row.id}
                  icon={row.icon}
                  title={row.title}
                  subtitle={row.subtitle}
                  divider={index < group.rows.length - 1}
                  right={
                    row.incomplete ? (
                      <Tag tone="warn" label={i18n.t('common.incomplete')} />
                    ) : undefined
                  }
                  onPress={() => {
                    props.onOpen(row.id);
                  }}
                />
              ))}
            </View>
          ))}
          {props.hasMore ? (
            <Button label={i18n.t('walks.loadMore')} tone="ghost" onPress={props.onLoadMore} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
