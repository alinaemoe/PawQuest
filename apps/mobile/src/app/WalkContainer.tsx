import {
  PLACE_CATEGORIES,
  DETAIL_FIELD_COUNT,
  computeWalkMetrics,
  createEvent,
  filledFields,
  finishWalk,
  getEvent,
  getEventDetail,
  getWalk,
  hidePrompt,
  isPromptHidden,
  lastTrackPoint,
  listEventTypes,
  linkWalksToPlace,
  panelEventTypes,
  pauseWalk,
  proposePlaces,
  restore,
  resumeWalk,
  setWalkPlace,
  softDelete,
  updateEvent,
  updateWalk,
  walkAnchor,
  type PlaceCategory,
  type Walk,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  ActiveWalkScreen,
  eventTypeLabel,
  EventDetailsSheet,
  walkFacts,
  WalkSummaryScreen,
  type GpsStatus,
  type WalkEventButton,
} from '@pawquest/screens';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { draftOfEvent, saveObservation } from './observation';
import { NewPlaceFlow } from './NewPlaceFlow';
import { markLook } from './QuickMarksContainer';
import { WalkRouteMap } from './RouteMap';
import { startGpsUpdates, stopGpsUpdates } from './walkRecorder';

const NOT_OBSERVATIONS = new Set(['toilet', 'note', 'exercise']);
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
  // the event whose details sheet is open (opened by a long press on its button)
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // refresh the distance and the GPS status every few seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const types = useMemo(() => panelEventTypes(db), [db, version]);

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
    kind: markLook(type),
    count: live.counts.get(type.id) ?? 0,
  }));

  /** Records an event now (at the last known position); returns its id. */
  const recordEvent = (typeId: string, quiet = false): string => {
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
    if (quiet) {
      return event.id;
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
    return event.id;
  };

  const typeChoices = useMemo(
    () =>
      listEventTypes(db)
        .filter((t) => !NOT_OBSERVATIONS.has(t.id))
        .map((t) => ({ id: t.id, label: eventTypeLabel(t, t.id, i18n) })),
    [db, i18n, version],
  );

  const details = useMemo(() => {
    if (detailsId === null) {
      return null;
    }
    const event = getEvent(db, detailsId);
    if (event === null) {
      return null;
    }
    const detail = getEventDetail(db, event.id);
    const type = listEventTypes(db, true).find((t) => t.id === event.typeId);
    return {
      event,
      draft: draftOfEvent(event, detail),
      title: `${eventTypeLabel(type, event.typeId, i18n)} · ${i18n.formatTime(event.ts)}`,
      filledLine: i18n.t('diary.fieldsFilled', {
        done: filledFields(event, detail),
        total: DETAIL_FIELD_COUNT,
      }),
    };
  }, [db, detailsId, i18n, version]);

  return (
    <>
      {keepAwake ? <KeepScreenOn /> : null}
      <ActiveWalkScreen
        map={<WalkRouteMap walkId={walk.id} mode="follow" height={170} refreshKey={tick} />}
        startedAt={walk.startedAt}
        pausedMs={pausedMs(db, walk.id)}
        paused={walk.status === 'paused'}
        distanceM={live.metrics.distanceM}
        gps={live.gps}
        events={buttons}
        recovery={recovery}
        onEvent={(typeId) => {
          recordEvent(typeId);
        }}
        onEventLong={(typeId) => {
          setDetailsId(recordEvent(typeId, true));
        }}
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
      {details === null ? null : (
        <EventDetailsSheet
          key={details.event.id}
          visible
          title={details.title}
          filledLine={details.filledLine}
          initial={details.draft}
          typeChoices={typeChoices}
          onSave={(draft) => {
            const id = details.event.id;
            saveObservation(db, ctx, { dogId, eventId: id, draft });
            // a reaction of 2 or more starts the recovery timer (S04-3)
            const recent = Date.now() - details.event.ts < 10 * 60_000;
            if (
              draft.reaction !== null &&
              draft.reaction >= 2 &&
              draft.recoveryText === '' &&
              recent
            ) {
              setRecovery((r) => r ?? { since: details.event.ts, eventId: id });
            }
            setDetailsId(null);
            bump();
            toast.show({ message: i18n.t('diary.saved') });
          }}
          onDelete={() => {
            const id = details.event.id;
            softDelete(db, ctx, 'event', id);
            setRecovery((r) => (r?.eventId === id ? null : r));
            setDetailsId(null);
            bump();
            toast.show({
              message: i18n.t('walk.eventDeleted'),
              actionLabel: i18n.t('common.undo'),
              durationMs: 6000,
              onAction: () => {
                restore(db, ctx, 'event', id);
                bump();
              },
            });
          }}
        />
      )}
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
interface PlaceCard {
  readonly kind: 'type' | 'cluster';
  readonly at: { readonly lat: number; readonly lon: number };
  readonly category: PlaceCategory | null;
  /** The size proposed from the walks; null to use the type's default. */
  readonly radiusM: number | null;
  /** Walks to link to the place once it is named. */
  readonly walkIds: readonly string[];
  /** Remembers that the owner does not want a suggestion at this spot. */
  readonly key: string | null;
}

const DAY = 86_400_000;
const SCALE_CATEGORY: Readonly<Record<'small' | 'medium' | 'large', PlaceCategory>> = {
  small: 'other',
  medium: 'meadow',
  large: 'park',
};
const FOREVER = 3650 * DAY;

export function WalkSummaryContainer({ walkId, onDone }: { walkId: string; onDone: () => void }) {
  const { db, ctx, i18n, bump } = useApp();
  const toast = useToast();
  const walk = useMemo(() => getWalk(db, walkId), [db, walkId]);
  const [naming, setNaming] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const eventsLine = useMemo(() => {
    const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
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

  // Decided once per summary: a walk that only had a type offers to name its place; otherwise a
  // place seen in repeated stops is suggested, at most once a day (S14-Auto).
  const [card] = useState<PlaceCard | null>(() => {
    const now = Date.now();
    const row = db.all('SELECT mode, place_id, place_kind FROM walk WHERE id = ?', [walkId])[0];
    if (row?.['mode'] !== 'gps') {
      return null;
    }
    if (row['place_id'] === null && typeof row['place_kind'] === 'string') {
      const at = walkAnchor(db, walkId, now);
      const kind = row['place_kind'];
      const category = (PLACE_CATEGORIES as readonly string[]).includes(kind)
        ? (kind as PlaceCategory)
        : null;
      return at === null
        ? null
        : { kind: 'type', at, category, radiusM: null, walkIds: [walkId], key: null };
    }
    if (isPromptHidden(db, 'place-suggest:daily', now)) {
      return null;
    }
    const proposal = proposePlaces(db, now).find((p) => !isPromptHidden(db, p.key, now));
    return proposal === undefined
      ? null
      : {
          kind: 'cluster',
          at: { lat: proposal.lat, lon: proposal.lon },
          // a park-sized wander is a park, a clearing-sized one a meadow, a doorway-sized one "other"
          category: SCALE_CATEGORY[proposal.scale],
          radiusM: proposal.radiusM,
          walkIds: proposal.walkIds,
          key: proposal.key,
        };
  });
  useEffect(() => {
    if (card?.kind === 'cluster') {
      hidePrompt(db, ctx, 'place-suggest:daily', Date.now() + DAY);
    }
    // once, when the summary opens
  }, []);

  if (walk === null) {
    return null;
  }
  const shown = card !== null && !dismissed;
  return (
    <>
      <WalkSummaryScreen
        map={<WalkRouteMap walkId={walk.id} mode="fit" height={220} />}
        summary={{
          facts: walkFacts(walk, i18n),
          eventsLine: eventsLine === '' ? null : eventsLine,
        }}
        placeCard={
          shown
            ? {
                text: i18n.t(card.kind === 'type' ? 'place.suggest.type' : 'place.suggest.cluster'),
                canDecline: card.key !== null,
              }
            : null
        }
        onPlaceName={() => {
          setNaming(true);
        }}
        onPlaceLater={() => {
          setDismissed(true);
        }}
        onPlaceNever={() => {
          if (card?.key != null) {
            hidePrompt(db, ctx, card.key, Date.now() + FOREVER);
          }
          setDismissed(true);
        }}
        onSave={({ mood, distraction, notes }) => {
          updateWalk(db, ctx, walk.id, { mood, distraction, notes, summaryPending: false });
          bump();
          toast.show({ message: i18n.t('sumw.saved') });
          onDone();
        }}
      />
      {card === null ? null : (
        <NewPlaceFlow
          visible={naming}
          at={card.at}
          {...(card.category === null ? {} : { initialCategory: card.category })}
          {...(card.radiusM === null ? {} : { initialRadiusM: card.radiusM })}
          onClose={() => {
            setNaming(false);
          }}
          onDone={(placeId) => {
            linkWalksToPlace(db, ctx, placeId, card.walkIds);
            if (card.kind === 'type') {
              setWalkPlace(db, ctx, walk.id, { placeId, placeKind: null });
            }
            bump();
            setNaming(false);
            setDismissed(true);
          }}
        />
      )}
    </>
  );
}
