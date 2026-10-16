import {
  TRASH_DAYS,
  emptyTrash,
  listEventTypes,
  listTrash,
  restore,
  type TrashTable,
} from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { useToast } from '@pawquest/rn-ui';
import { eventTypeLabel, TrashScreen, type TrashRowModel } from '@pawquest/screens';
import { useMemo } from 'react';

import { useApp } from './AppContext';

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

/** Settings -> Data -> Trash: deleted records with the days they have left, restore, empty. */
export function TrashContainer({ onBack }: { onBack: () => void }) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();

  const rows = useMemo<TrashRowModel[]>(() => {
    const now = Date.now();
    const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
    return listTrash(db).map((item) => {
      const left = Math.max(0, TRASH_DAYS - Math.floor((now - item.deletedAt) / DAY));
      return {
        key: `${item.table}:${item.id}`,
        kind: i18n.t(`trash.kind.${item.table}` as MessageKey),
        // records without a name are labelled by their timestamp: show it as a date and time
        label:
          item.table === 'event' && types.has(item.label)
            ? eventTypeLabel(types.get(item.label), item.label, i18n)
            : ISO.test(item.label)
              ? `${i18n.formatDate(Date.parse(item.label), now)} ${i18n.formatTime(Date.parse(item.label))}`
              : item.label,
        daysLeft: i18n.t('trash.daysLeft', { n: left }),
      };
    });
  }, [db, i18n, version]);

  return (
    <TrashScreen
      rows={rows}
      onBack={onBack}
      onRestore={(key) => {
        const [table, id] = key.split(':');
        if (table !== undefined && id !== undefined) {
          restore(db, ctx, table as TrashTable, id);
          bump();
          toast.show({ message: i18n.t('common.restored') });
        }
      }}
      onEmpty={() => {
        emptyTrash(db);
        bump();
        toast.show({ message: i18n.t('trash.cleared') });
      }}
    />
  );
}
