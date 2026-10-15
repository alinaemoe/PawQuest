import {
  addWeight,
  createEvent,
  createManualWalk,
  hidePrompt,
  isPromptHidden,
  isWeightDue,
  lastCompletedWalk,
  latestWeight,
  listEventTypes,
  recentFeed,
  softDelete,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  AddSheet,
  feedRow,
  NoteSheet,
  TodayScreen,
  WalkSheet,
  WeightSheet,
  weightCardTitle,
  type AddChoice,
  type ManualWalk,
} from '@pawquest/screens';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';

const DAY = 86_400_000;

function deviceOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}

export interface TodayContainerProps {
  /** Open the manual walk sheet right away (the "log your first walk" button of onboarding). */
  readonly autoOpenWalk: boolean;
  readonly onWalkSheetShown: () => void;
  /** Opens the training skill picker (the "training at home" tile and the + menu). */
  readonly onTraining: () => void;
}

type SheetId = 'add' | 'note' | 'weight' | 'walk' | null;

/** Connects Today to the database: reads what the screen shows and writes what its buttons do. */
export function TodayContainer({
  autoOpenWalk,
  onWalkSheetShown,
  onTraining,
}: TodayContainerProps) {
  const { db, ctx, dog, settings, i18n, version, bump } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [now, setNow] = useState(() => Date.now());

  // "4 hours ago" must not freeze: refresh the clock every minute.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (autoOpenWalk) {
      setSheet('walk');
      onWalkSheetShown();
    }
  }, [autoOpenWalk, onWalkSheetShown]);

  const dogId = dog?.id ?? '';
  const data = useMemo(() => {
    const current = Math.max(now, Date.now());
    const types = new Map(listEventTypes(db).map((t) => [t.id, t]));
    const weight = latestWeight(db, dogId);
    const due =
      isWeightDue(weight, current, settings.weightIntervalDays) &&
      !isPromptHidden(db, 'weight', current);
    const feed = recentFeed(db, dogId, 5);
    return {
      lastWalk: lastCompletedWalk(db, dogId),
      weightCard: due ? { title: weightCardTitle(weight, i18n, current) } : null,
      recent: feed.map((item) => feedRow(item, i18n, types, current)),
      firstRun: feed.length === 0,
    };
  }, [db, dogId, version, now, settings.weightIntervalDays, i18n]);

  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);

  const logToilet = (): void => {
    const event = createEvent(db, ctx, {
      dogId,
      typeId: 'toilet',
      tzOffsetMin: deviceOffsetMin(),
      incomplete: false,
    });
    bump();
    toast.show({
      message: i18n.t('today.toiletSaved'),
      actionLabel: i18n.t('common.undo'),
      durationMs: 8000,
      onAction: () => {
        softDelete(db, ctx, 'event', event.id);
        bump();
      },
    });
  };

  const saveNote = (text: string): void => {
    createEvent(db, ctx, {
      dogId,
      typeId: 'note',
      note: text,
      tzOffsetMin: deviceOffsetMin(),
      incomplete: false,
    });
    setSheet(null);
    bump();
    toast.show({ message: i18n.t('note.saved') });
  };

  const saveWeight = (grams: number): void => {
    addWeight(db, ctx, { dogId, weightG: grams });
    setSheet(null);
    bump();
    toast.show({ message: i18n.t('weight.saved') });
  };

  const saveWalk = (walk: ManualWalk): void => {
    const endedAt = ctx.now() - walk.endedAgoMs;
    createManualWalk(db, ctx, {
      dogId,
      startedAt: endedAt - walk.durationMin * 60_000,
      durationS: walk.durationMin * 60,
      distanceM: walk.distanceM,
      tzOffsetMin: deviceOffsetMin(),
    });
    setSheet(null);
    bump();
    toast.show({ message: i18n.t('walk.saved') });
  };

  const choose = (choice: AddChoice): void => {
    if (choice === 'walk') {
      setSheet('walk');
    } else if (choice === 'observation') {
      setSheet('note');
    } else if (choice === 'weight') {
      setSheet('weight');
    } else {
      setSheet(null);
      onTraining();
    }
  };

  return (
    <>
      <TodayScreen
        now={now}
        dogName={dog?.name ?? ''}
        dogPhotoUri={dog?.photoUri ?? null}
        gpsWalks={false}
        lastWalk={
          data.lastWalk === null
            ? null
            : { startedAt: data.lastWalk.startedAt, durationS: data.lastWalk.durationS }
        }
        weightCard={data.weightCard}
        recent={data.recent}
        firstRun={data.firstRun}
        onStartWalk={() => {
          setSheet('walk');
        }}
        onTraining={onTraining}
        onNote={() => {
          setSheet('note');
        }}
        onToilet={logToilet}
        onWeightRecord={() => {
          setSheet('weight');
        }}
        onWeightLater={() => {
          hidePrompt(db, ctx, 'weight', ctx.now() + DAY);
          bump();
        }}
        onWeightHide={() => {
          hidePrompt(db, ctx, 'weight', ctx.now() + settings.weightIntervalDays * DAY);
          bump();
        }}
        onRecentPress={() => undefined}
        onFab={() => {
          setSheet('add');
        }}
      />
      <AddSheet visible={sheet === 'add'} onClose={closeSheet} onChoose={choose} />
      <NoteSheet visible={sheet === 'note'} onClose={closeSheet} onSave={saveNote} />
      <WeightSheet
        visible={sheet === 'weight'}
        units={settings.units}
        onClose={closeSheet}
        onSave={saveWeight}
      />
      <WalkSheet
        visible={sheet === 'walk'}
        units={settings.units}
        onClose={closeSheet}
        onSave={saveWalk}
      />
    </>
  );
}
