import {
  addWeight,
  createEvent,
  createManualWalk,
  hidePrompt,
  isPromptHidden,
  isWeightDue,
  listPlans,
  lastCompletedWalk,
  latestWeight,
  listEventTypes,
  recentFeed,
  onThisDay,
  softDelete,
  weatherUsual,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  AddSheet,
  memoryModels,
  PhotoViewer,
  feedRow,
  planCard,
  planTitle,
  todayCareCard,
  NoteSheet,
  TodayScreen,
  WalkSheet,
  WeatherSheet,
  WeightSheet,
  weatherUsualLine,
  weatherView,
  weightCardTitle,
  type AddChoice,
  type ManualWalk,
} from '@pawquest/screens';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';
import type { CareTarget } from './CareFlow';
import { useWeather } from './useWeather';

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
  /** Opens the diary form: "new" or the id of an existing observation. */
  readonly onObservation: (id: string) => void;
  readonly onCare: (target: CareTarget) => void;
  /** The big button: opens the pre-walk sheet for a GPS walk. */
  readonly onStartWalk: () => void;
}

type SheetId = 'add' | 'note' | 'weight' | 'walk' | null;

/** Connects Today to the database: reads what the screen shows and writes what its buttons do. */
export function TodayContainer({
  autoOpenWalk,
  onWalkSheetShown,
  onTraining,
  onObservation,
  onCare,
  onStartWalk,
}: TodayContainerProps) {
  const { db, ctx, dog, settings, i18n, version, bump } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [now, setNow] = useState(() => Date.now());
  const weather = useWeather();
  const [weatherOpen, setWeatherOpen] = useState(false);
  // "on this day": what happened on today's date in earlier years
  const memories = useMemo(
    () =>
      dog === null
        ? []
        : memoryModels(onThisDay(db, dog.id, Date.now(), -new Date().getTimezoneOffset()), i18n),
    [db, dog, i18n, version],
  );
  const [viewer, setViewer] = useState<{
    photos: readonly { id: string; uri: string }[];
    index: number;
  } | null>(null);
  // how many walks were in weather like this, and how long they usually lasted
  const weatherUsualText = useMemo(
    () =>
      dog === null || weather.facts === null
        ? null
        : weatherUsualLine(weatherUsual(db, dog.id, weather.facts), i18n),
    [db, dog, weather.facts, i18n, version],
  );
  const weatherModel = useMemo(
    () =>
      weather.facts === null
        ? null
        : weatherView(weather.facts, i18n, Math.max(now, weather.facts.at)),
    [weather.facts, i18n, now],
  );

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
    const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
    const weight = latestWeight(db, dogId);
    const due =
      isWeightDue(weight, current, settings.weightIntervalDays) &&
      !isPromptHidden(db, 'weight', current);
    const feed = recentFeed(db, dogId, 5);
    const plans = listPlans(db, dogId).filter((p) => p.enabled);
    const offset = -new Date().getTimezoneOffset();
    const care = todayCareCard(
      plans
        .filter((p) => !isPromptHidden(db, `care:${p.id}`, current))
        .map((p) => planCard(p, current, offset, i18n)),
    );
    return {
      care:
        care === null
          ? null
          : {
              planId: care.planId,
              line: i18n.t('health.cardLine', { name: care.title, status: care.statusText }),
            },
      plans,
      lastWalk: lastCompletedWalk(db, dogId),
      weightCard: due && care === null ? { title: weightCardTitle(weight, i18n, current) } : null,
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
      setSheet(null);
      onObservation('new');
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
        gpsWalks
        lastWalk={
          data.lastWalk === null
            ? null
            : { startedAt: data.lastWalk.startedAt, durationS: data.lastWalk.durationS }
        }
        careCard={data.care}
        onCareDone={(planId) => {
          const plan = data.plans.find((p) => p.id === planId);
          if (plan !== undefined) {
            onCare({
              planId: plan.id,
              kind: plan.kind,
              subtype: plan.subtype,
              name: planTitle(plan, i18n),
              defaultProduct: plan.lastProduct ?? plan.defaultProduct,
            });
          }
        }}
        onCareLater={(planId) => {
          hidePrompt(db, ctx, `care:${planId}`, ctx.now() + DAY);
          bump();
        }}
        weightCard={data.weightCard}
        weather={weatherModel}
        weatherUsual={weatherUsualText}
        memories={memories}
        onOpenMemoryPhoto={(photos, index) => {
          setViewer({ photos, index });
        }}
        weatherHint={
          weatherModel !== null
            ? null
            : weather.status === 'no-permission'
              ? i18n.t('weather.noPlace')
              : weather.status === 'unavailable'
                ? i18n.t('weather.unavailable')
                : null
        }
        onWeather={() => {
          if (weatherModel !== null) {
            setWeatherOpen(true);
          } else if (weather.status === 'no-permission') {
            weather.enable();
          }
        }}
        recent={data.recent}
        firstRun={data.firstRun}
        onStartWalk={onStartWalk}
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
        onRecentPress={(row) => {
          if (row.kind === 'event') {
            onObservation(row.id);
          }
        }}
        onFab={() => {
          setSheet('add');
        }}
      />
      <PhotoViewer
        photos={viewer?.photos ?? []}
        openAt={viewer === null ? null : viewer.index}
        onClose={() => {
          setViewer(null);
        }}
        onRemove={() => undefined}
        canRemove={false}
      />
      {weatherOpen ? (
        <WeatherSheet
          view={weatherModel}
          onClose={() => {
            setWeatherOpen(false);
          }}
        />
      ) : null}
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
