import { AppText, Avatar, Button, Chip, Screen, Sheet, ListRow, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

export interface TrashRowModel {
  readonly key: string;
  readonly kind: string;
  readonly label: string;
  /** "осталось 29 дней" */
  readonly daysLeft: string;
}

export interface TrashScreenProps {
  readonly rows: readonly TrashRowModel[];
  readonly onBack: () => void;
  readonly onRestore: (key: string) => void;
  readonly onEmpty: () => void;
}

/** Settings -> Data -> Trash (G-02): everything deleted in the last 30 days, with restore. */
export function TrashScreen({ rows, onBack, onRestore, onEmpty }: TrashScreenProps) {
  const i18n = useI18n();
  const [confirm, setConfirm] = useState(false);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('trash.title')}</AppText>

      {rows.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 36 }}>
          <Avatar icon="trash" size={88} />
          <AppText variant="title">{i18n.t('trash.emptyTitle')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('trash.emptyText')}
          </AppText>
        </View>
      ) : (
        <>
          <View>
            {rows.map((row, index) => (
              <ListRow
                key={row.key}
                icon="trash"
                title={`${row.kind} · ${row.label}`}
                subtitle={row.daysLeft}
                divider={index < rows.length - 1}
                right={
                  <Chip
                    size="sm"
                    label={i18n.t('trash.restore')}
                    onPress={() => {
                      onRestore(row.key);
                    }}
                  />
                }
              />
            ))}
          </View>
          <Button
            label={i18n.t('trash.emptyAll')}
            tone="ghost"
            icon="trash"
            onPress={() => {
              setConfirm(true);
            }}
          />
        </>
      )}

      <Sheet
        visible={confirm}
        onClose={() => {
          setConfirm(false);
        }}
        title={i18n.t('trash.confirmTitle')}
      >
        <AppText>{i18n.t('trash.confirmText', { n: rows.length })}</AppText>
        <Button
          label={i18n.t('trash.emptyAll')}
          onPress={() => {
            setConfirm(false);
            onEmpty();
          }}
        />
        <Button
          label={i18n.t('common.cancel')}
          tone="ghost"
          onPress={() => {
            setConfirm(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}
