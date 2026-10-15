import {
  computeWalkMetrics,
  createEvent,
  finishWalk,
  getWalk,
  lastTrackPoint,
  panelEventTypes,
  pauseWalk,
  resumeWalk,
  softDelete,
  updateEvent,
  updateWalk,
  type EventType,
  type Walk,
} from '@pawquest/data';
import { useToast, type EventKind } from '@pawquest/rn-ui';
import {
  ActiveWalkScreen,
  eventTypeLabel,
  walkFacts,
  WalkSummaryScreen,
  type GpsStatus,
  type WalkEventButton,
} from '@pawquest/screens';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { startGpsUpdates, stopGpsUpdates } from './walkRecorder';

const KINDS = new Set<string>(['dog', 'person', 'child', 'animal', 'ok', 'hard', 'ex']);
const toKind = (type: EventType): EventKind =>
  KINDS.has(type.color) ? (type.color as EventKind) : 'ex';

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

export interface WalkContainerProps {
  readonly walk: Walk;
  readonly dogId: string;
  /** Keep the screen on: background recording was not allowed. */
  readonly keepAwake: boolean;
  readonly onTraining: () => void;
  /** The walk was finished: the summary opens for it. */
  readonly onFinished: (walkId: string) => void;
}

/** The walk in progress. Everything is written to the database as it happens. */
export function WalkContainer({
  walk,
  dogId,
  keepAwake,
  onTraining,
  onFinished,
}: WalkContainerProps) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [recovery, setRecovery] = useState<{ since: number; eventId: string } | null>(null);

  // refresh the distance and the GPS status every few seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const types = useMemo(() => panelEventTypes(db), [db]);

  const live = useMemo(() => {
    const now = Date.now();
    const metrics = computeWalkMetrics(db, walk.id, now);
    const last = lastTrackPoint(db, walk.id);
    let gps: GpsStatus = 'off';
    if (walk.mode === 'gps') {
      const age = last === null ? Number.POSITIVE_INFINITY : now - last.ts;
      gps = age > 15_000 ? 'none' : (last?.accuracyM ?? 99) <= 15 ? 'good' : 'weak';
    }
    const counts = new Map(
      db
        .all(
          'SELECT type_id, COUNT(*) AS n FROM event WHERE walk_id = ? AND deleted_at IS NULL GROUP BY type_id',
          [walk.id],
        )
        .map((row) => [String(row['type_id']), Number(row['n'])]),
    );
    return { metrics, gps, counts };
  }, [db, walk.id, walk.mode, tick, version]);

  const buttons: WalkEventButton[] = types.map((type) => ({
    id: type.id,
    label: eventTypeLabel(type, type.id, i18n),
    kind: toKind(type),
    count: live.counts.get(type.id) ?? 0,
  }));

  const recordEvent = (typeId: string): void => {
    const type = types.find((t) => t.id === typeId);
    const last = lastTrackPoint(db, walk.id);
    const event = createEvent(db, ctx, {
      dogId,
      walkId: walk.id,
      typeId,
      lat: last?.lat ?? null,
      lon: last?.lon ?? null,
      tzOffsetMin: -new Date().getTimezoneOffset(),
    });
    bump();
    if (type?.startsRecoveryTimer === true) {
      setRecovery({ since: Date.now(), eventId: event.id });
    }
    toast.show({
      message: i18n.t('active.recorded', {
        label: type === undefined ? typeId : eventTypeLabel(type, typeId, i18n),
      }),
      actionLabel: i18n.t('common.undo'),
      durationMs: 3000,
      onAction: () => {
        softDelete(db, ctx, 'event', event.id);
        setRecovery((r) => (r?.eventId === event.id ? null : r));
        bump();
      },
    });
  };

  return (
    <>
      {keepAwake ? <KeepScreenOn /> : null}
      <ActiveWalkScreen
        startedAt={walk.startedAt}
        pausedMs={pausedMs(db, walk.id)}
        paused={walk.status === 'paused'}
        distanceM={live.metrics.distanceM}
        gps={live.gps}
        events={buttons}
        recovery={recovery}
        onEvent={recordEvent}
        onCalm={() => {
          if (recovery !== null) {
            updateEvent(db, ctx, recovery.eventId, {
              recoveryS: Math.round((Date.now() - recovery.since) / 1000),
            });
            setRecovery(null);
            bump();
          }
        }}
        onTraining={onTraining}
        onTogglePause={() => {
          if (walk.status === 'paused') {
            resumeWalk(db, ctx, walk.id);
            if (walk.mode === 'gps') {
              void startGpsUpdates(i18n.t('active.notifTitle'), i18n.t('active.notifBody'));
            }
          } else {
            pauseWalk(db, ctx, walk.id);
            void stopGpsUpdates();
          }
          bump();
        }}
        onFinishHint={() => {
          toast.show({ message: i18n.t('active.finishHint'), durationMs: 2000 });
        }}
        onFinish={() => {
          void stopGpsUpdates();
          const done = finishWalk(db, ctx, walk.id);
          onFinished(done.id);
          bump();
        }}
      />
    </>
  );
}

/** Milliseconds the walk has spent paused so far (an open pause counts up to now). */
function pausedMs(db: ReturnType<typeof useApp>['db'], walkId: string): number {
  const now = new Date().toISOString();
  const row = db.all(
    `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, ?)) - julianday(started_at)) * 86400000), 0) AS ms
       FROM walk_segment WHERE walk_id = ? AND kind = 'paused'`,
    [now, walkId],
  )[0];
  return Number(row?.['ms'] ?? 0);
}

/** The summary shown right after a walk (spec S05): numbers, how it went, one tap to save. */
export function WalkSummaryContainer({ walkId, onDone }: { walkId: string; onDone: () => void }) {
  const { db, ctx, i18n, bump } = useApp();
  const toast = useToast();
  const walk = useMemo(() => getWalk(db, walkId), [db, walkId]);
  const eventsLine = useMemo(() => {
    const types = new Map(panelEventTypes(db).map((t) => [t.id, t]));
    return db
      .all(
        'SELECT type_id, COUNT(*) AS n FROM event WHERE walk_id = ? AND deleted_at IS NULL GROUP BY type_id',
        [walkId],
      )
      .map((row) => {
        const id = String(row['type_id']);
        return `${eventTypeLabel(types.get(id), id, i18n)} ×${String(row['n'])}`;
      })
      .join(' · ');
  }, [db, walkId, i18n]);

  if (walk === null) {
    return null;
  }
  return (
    <WalkSummaryScreen
      summary={{ facts: walkFacts(walk, i18n), eventsLine: eventsLine === '' ? null : eventsLine }}
      onSave={({ mood, distraction, notes }) => {
        updateWalk(db, ctx, walk.id, { mood, distraction, notes, summaryPending: false });
        bump();
        toast.show({ message: i18n.t('sumw.saved') });
        onDone();
      }}
    />
  );
}
