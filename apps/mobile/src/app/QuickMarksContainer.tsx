import {
  archiveCustomMark,
  createCustomMark,
  listEventTypes,
  resetPanel,
  restoreCustomMark,
  setPanelOrder,
  type EventType,
} from '@pawquest/data';
import { useToast, type EventKind } from '@pawquest/rn-ui';
import {
  addToOrder,
  eventTypeLabel,
  moveInOrder,
  NewMarkSheet,
  panelIsFull,
  QuickMarksScreen,
  removeFromOrder,
  type MarkRow,
} from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

const LOOKS = new Set<string>(['dog', 'person', 'child', 'animal', 'ok', 'hard', 'ex']);

/** The look of a mark's button: its own color token, or the purple square for the plain ones. */
export const markLook = (type: EventType): EventKind =>
  LOOKS.has(type.color) ? (type.color as EventKind) : 'ex';

export interface QuickMarksContainerProps {
  readonly onBack: () => void;
}

/** Dog -> Quick marks: which buttons the walk screen shows, their order, and the owner's own marks. */
export function QuickMarksContainer({ onBack }: QuickMarksContainerProps) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const data = useMemo(() => {
    const row = (t: EventType): MarkRow => ({
      id: t.id,
      label: eventTypeLabel(t, t.id, i18n),
      look: markLook(t),
      custom: !t.builtin,
    });
    const all = listEventTypes(db);
    return {
      panel: all
        .filter((t) => t.slot !== null)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map(row),
      // the training mark is created by the "Тренировка" button, not tapped on the panel
      catalog: all.filter((t) => t.slot === null && t.id !== 'exercise').map(row),
    };
  }, [db, i18n, version]);

  const order = data.panel.map((m) => m.id);
  const apply = (next: readonly string[]): void => {
    setPanelOrder(db, ctx, next);
    bump();
  };

  return (
    <>
      <QuickMarksScreen
        panel={data.panel}
        catalog={data.catalog}
        onBack={onBack}
        onMove={(id, direction) => {
          apply(moveInOrder(order, order.indexOf(id), direction));
        }}
        onRemove={(id) => {
          apply(removeFromOrder(order, id));
        }}
        onAdd={(id) => {
          apply(addToOrder(order, id));
        }}
        onNew={() => {
          setCreating(true);
        }}
        onDelete={(id) => {
          archiveCustomMark(db, ctx, id);
          bump();
          toast.show({
            message: i18n.t('marks.deleted'),
            actionLabel: i18n.t('common.undo'),
            durationMs: 6000,
            onAction: () => {
              restoreCustomMark(db, ctx, id);
              bump();
            },
          });
        }}
        onReset={() => {
          resetPanel(db, ctx);
          bump();
        }}
      />
      <NewMarkSheet
        visible={creating}
        panelFull={panelIsFull(order)}
        onClose={() => {
          setCreating(false);
        }}
        onCreate={({ label, look, onPanel }) => {
          createCustomMark(db, ctx, { label, look, onPanel });
          setCreating(false);
          bump();
        }}
      />
    </>
  );
}
