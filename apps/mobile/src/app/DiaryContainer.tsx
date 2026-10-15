import {
  createEvent,
  getEvent,
  getEventDetail,
  listDiary,
  listEventTypes,
  restore,
  saveEventDetail,
  softDelete,
  updateEvent,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  DiaryScreen,
  eventTypeLabel,
  filledLine,
  groupDiaryByDay,
  ObservationScreen,
  type DiaryFilterId,
  type ObservationDraft,
} from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

const PAGE = 30;
const NOT_OBSERVATIONS = new Set(['toilet', 'note', 'exercise']);

export interface DiaryContainerProps {
  /** Open straight into the form: "new" or the id of an entry. */
  readonly initialOpen: string | null;
  readonly onBack: () => void;
}

const EMPTY: ObservationDraft = {
  typeId: 'dog',
  distanceBucket: null,
  reaction: null,
  distraction: null,
  behaviors: [],
  ownerActions: [],
  outcome: null,
  recoveryText: '',
  antecedent: '',
  note: '',
  thought: '',
  agoMs: 0,
};

/** The behavior diary: the list, and the ABC form for a new or an existing observation. */
export function DiaryContainer({ initialOpen, onBack }: DiaryContainerProps) {
  const { db, ctx, dog, i18n, version, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  const [filter, setFilter] = useState<DiaryFilterId>('all');
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState<string | null>(initialOpen);

  const types = useMemo(() => new Map(listEventTypes(db).map((t) => [t.id, t])), [db, version]);
  const typeChoices = useMemo(
    () =>
      [...types.values()]
        .filter((t) => !NOT_OBSERVATIONS.has(t.id))
        .map((t) => ({ id: t.id, label: eventTypeLabel(t, t.id, i18n) })),
    [types, i18n],
  );

  const list = useMemo(() => {
    const entries = listDiary(db, dogId, PAGE * pages, { onlyIncomplete: filter === 'incomplete' });
    return {
      groups: groupDiaryByDay(entries, i18n, types, Date.now()),
      hasMore: entries.length === PAGE * pages,
    };
  }, [db, dogId, pages, filter, i18n, types, version]);

  const existing = useMemo(() => {
    if (open === null || open === 'new') {
      return null;
    }
    const event = getEvent(db, open);
    if (event === null) {
      return null;
    }
    const detail = getEventDetail(db, event.id);
    return { event, detail };
  }, [db, open, version]);

  const initial = useMemo<ObservationDraft>(() => {
    if (existing === null) {
      return EMPTY;
    }
    const { event, detail } = existing;
    return {
      typeId: event.typeId,
      distanceBucket: event.distanceBucket,
      reaction: event.reaction,
      distraction: event.distraction,
      behaviors: detail.behaviors,
      ownerActions: detail.ownerActions,
      outcome: detail.outcome,
      recoveryText: event.recoveryS === null ? '' : String(event.recoveryS),
      antecedent: detail.antecedent ?? '',
      note: event.note ?? '',
      thought: detail.interpretation ?? '',
      agoMs: -1, // keep the original time unless another one is chosen
    };
  }, [existing]);

  const save = (draft: ObservationDraft): void => {
    const recovery = /^\d{1,4}$/.test(draft.recoveryText) ? Number(draft.recoveryText) : null;
    const common = {
      typeId: draft.typeId,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
      distanceBucket: draft.distanceBucket,
      reaction: draft.reaction,
      distraction: draft.distraction,
      recoveryS: recovery,
      incomplete: false,
    };
    const detail = {
      antecedent: draft.antecedent.trim() === '' ? null : draft.antecedent.trim(),
      behaviors: draft.behaviors,
      ownerActions: draft.ownerActions,
      outcome: draft.outcome,
      consequenceNote: null,
      interpretation: draft.thought.trim() === '' ? null : draft.thought.trim(),
    };
    let id: string;
    if (existing === null) {
      id = createEvent(db, ctx, {
        dogId,
        ...common,
        ts: ctx.now() - Math.max(0, draft.agoMs),
        tzOffsetMin: -new Date().getTimezoneOffset(),
      }).id;
    } else {
      id = existing.event.id;
      updateEvent(db, ctx, id, {
        ...common,
        ...(draft.agoMs >= 0 ? { ts: ctx.now() - draft.agoMs } : {}),
      });
    }
    saveEventDetail(db, ctx, id, detail);
    setOpen(null);
    bump();
    toast.show({ message: i18n.t('diary.saved') });
  };

  const remove = (): void => {
    if (existing === null) {
      return;
    }
    const id = existing.event.id;
    softDelete(db, ctx, 'event', id);
    setOpen(null);
    bump();
    toast.show({
      message: i18n.t('diary.deleted'),
      actionLabel: i18n.t('common.undo'),
      durationMs: 8000,
      onAction: () => {
        restore(db, ctx, 'event', id);
        bump();
      },
    });
  };

  if (open !== null) {
    return (
      <ObservationScreen
        key={open}
        initial={initial}
        typeChoices={typeChoices}
        existing={existing === null ? null : { filledLine: filledLine(existing, i18n) }}
        onSave={save}
        onDelete={remove}
        onBack={() => {
          setOpen(null);
        }}
      />
    );
  }

  return (
    <DiaryScreen
      groups={list.groups}
      filter={filter}
      hasMore={list.hasMore}
      onFilter={(next) => {
        setFilter(next);
        setPages(1);
      }}
      onLoadMore={() => {
        setPages((p) => p + 1);
      }}
      onOpen={setOpen}
      onNew={() => {
        setOpen('new');
      }}
      onBack={onBack}
    />
  );
}
