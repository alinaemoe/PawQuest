import {
  PLACE_CATEGORIES,
  DETAIL_FIELD_COUNT,
  computeWalkMetrics,
  createEvent,
  createPlace,
  filledFields,
  finishWalk,
  getEvent,
  getEventDetail,
  getWalk,
  liveZones,
  hidePrompt,
  addWalkPhoto,
  isPromptHidden,
  lastTrackPoint,
  listEventTypes,
  linkWalksToPlace,
  listWalkPhotos,
  panelEventTypes,
  pauseWalk,
  proposeBases,
  proposePlaces,
  proposeRoutes,
  createRoute,
  restore,
  routePasses,
  resumeWalk,
  setWalkPlace,
  softDelete,
  splitWalkAroundStayUndoable,
  trimWalkEndUndoable,
  updateEvent,
  updatePlace,
  updateWalk,
  walkAnchor,
  walkBaseArrival,
  walkStartSpotArrival,
  walkCutSuggestion,
  walkRoutePasses,
  walkUsual,
  refreshDerived,
  type PlaceCategory,
  type Walk,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  ActiveWalkScreen,
  BaseArrivalSheet,
  categoryLabel,
  usualModel,
  NewRouteSheet,
  suggestedRouteName,
  versusUsual,
  eventTypeLabel,
  EventDetailsSheet,
  walkFacts,
  WalkSummaryScreen,
  type GpsStatus,
  type WalkEventButton,
} from '@pawquest/screens';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useApp } from './AppContext';
import { draftOfEvent, saveObservation } from './observation';
import { NewPlaceFlow } from './NewPlaceFlow';
import { markLook } from './QuickMarksContainer';
import { takePhoto } from './photoCapture';
import { maybeAutoFinish } from './autoFinish';
import { ReplayButton } from './ReplayContainer';
import { WalkRouteMap } from './RouteMap';
import { WalkPhotos } from './WalkPhotos';
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

  // the saved places the walk is in now, looked at every few seconds; a new one is told once
  const [zoneTick, setZoneTick] = useState(0);
  useEffect(() => {
    if (walk.mode !== 'gps' || walk.status !== 'active') {
      return;
    }
    const timer = setInterval(() => {
      setZoneTick((t) => t + 1);
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [walk.mode, walk.status]);
  const zones = useMemo(
    () =>
      walk.mode === 'gps' && walk.status === 'active' ? liveZones(db, walk.id, Date.now()) : [],
    [db, walk.id, walk.mode, walk.status, zoneTick],
  );
  const seenZones = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const zone of zones) {
      if (!seenZones.current.has(zone.placeId)) {
        seenZones.current.add(zone.placeId);
        toast.show({
          message:
            zone.notes === null || zone.notes.trim() === ''
              ? i18n.t('zone.entered', { place: zone.name })
              : i18n.t('zone.enteredNote', { place: zone.name, note: zone.notes }),
          durationMs: zone.notes === null ? 3000 : 6000,
        });
      }
    }
    // a place that was left may be entered again: it is told again
    const now = new Set(zones.map((z) => z.placeId));
    for (const id of seenZones.current) {
      if (!now.has(id)) {
        seenZones.current.delete(id);
      }
    }
  }, [zones, toast, i18n]);

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

  const photoCount = useMemo(() => listWalkPhotos(db, walk.id).length, [db, walk.id, version]);

  // "You came to Mom's. Finish the walk?": looked at once a minute while the walk is running
  const [arrivalTick, setArrivalTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      // the walk may have ended by itself in the background (came home and forgot): show its summary
      if (getWalk(db, walk.id)?.status === 'completed') {
        onFinished(walk.id);
        return;
      }
      void maybeAutoFinish(db, ctx, stopGpsUpdates).then((id) => {
        if (id !== null) {
          onFinished(id);
        }
      });
      setArrivalTick((t) => t + 1);
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const arrival = useMemo(() => {
    if (walk.mode !== 'gps' || walk.status !== 'active') {
      return null;
    }
    const now = Date.now();
    // a marked base first; without one, "back where the walk began" stands in for home
    const base = walkBaseArrival(db, walk.id, now);
    const found = base ?? walkStartSpotArrival(db, walk.id, now);
    return found === null || isPromptHidden(db, `base-arrival:${walk.id}:${found.placeId}`, now)
      ? null
      : { ...found, fromStart: base === null };
  }, [db, walk.id, walk.mode, walk.status, arrivalTick, version]);

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
        zone={
          zones.length === 0
            ? null
            : {
                names: zones.map((z) => z.name).join(' › '),
                sinceTs: zones[0]?.sinceTs ?? Date.now(),
                hint: zones.find((z) => z.notes !== null && z.notes.trim() !== '')?.notes ?? null,
              }
        }
        onEvent={(typeId) => {
          recordEvent(typeId);
        }}
        onEventLong={(typeId) => {
          setDetailsId(recordEvent(typeId, true));
        }}
        photoCount={photoCount}
        onPhoto={() => {
          void (async () => {
            const id = ctx.newId();
            const result = await takePhoto(id);
            if (result.kind === 'denied') {
              toast.show({ message: i18n.t('photo.denied'), durationMs: 4000 });
            } else if (result.kind === 'photo') {
              const last = lastTrackPoint(db, walk.id);
              addWalkPhoto(db, ctx, walk.id, {
                ...result.photo,
                takenAt: Date.now(),
                lat: last?.lat ?? null,
                lon: last?.lon ?? null,
              });
              bump();
              toast.show({ message: i18n.t('photo.added') });
            }
          })();
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
      {arrival === null ? null : (
        <BaseArrivalSheet
          visible
          placeName={arrival.placeName}
          fromStart={arrival.fromStart}
          onMarkHome={() => {
            createPlace(db, ctx, {
              category: 'home',
              name: i18n.t('arrival.homeName'),
              label: categoryLabel('home', i18n),
              lat: arrival.visit.lat,
              lon: arrival.visit.lon,
            });
            void stopGpsUpdates();
            const done = finishWalk(db, ctx, walk.id, arrival.arrivedAt);
            onFinished(done.id);
            bump();
          }}
          stay={i18n.formatDuration(Math.round(arrival.stayS))}
          onFinish={() => {
            void stopGpsUpdates();
            const done = finishWalk(db, ctx, walk.id, arrival.arrivedAt);
            onFinished(done.id);
            bump();
          }}
          onKeepWalking={() => {
            // ask again in half an hour
            hidePrompt(
              db,
              ctx,
              `base-arrival:${walk.id}:${arrival.placeId}`,
              Date.now() + 30 * 60_000,
            );
            bump();
          }}
        />
      )}
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
  readonly kind: 'type' | 'cluster' | 'base';
  /** For a base: the saved place here that may become it ("Двор" → "Дом"). */
  readonly basePlace?: { readonly id: string; readonly name: string } | undefined;
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
  const { db, ctx, dog, i18n, bump } = useApp();
  const toast = useToast();
  const walk = useMemo(() => getWalk(db, walkId), [db, walkId]);
  // the walk against walks like it: the walk that has just ended is worked out first, so that
  // the comparison is there when the summary opens
  const [usual] = useState(() => {
    if (dog === null) {
      return null;
    }
    refreshDerived(db, ctx, dog.id, { limit: 3 });
    return usualModel(walkUsual(db, dog.id, walkId), i18n);
  });
  const [naming, setNaming] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [cutDone, setCutDone] = useState(false);
  // a way walked again and again: offered a name, at most once a day (A-27)
  const [routeNaming, setRouteNaming] = useState(false);
  const [routeDismissed, setRouteDismissed] = useState(false);
  const routeProposal = useMemo(() => {
    const now = Date.now();
    if (isPromptHidden(db, 'route-suggest:daily', now)) {
      return null;
    }
    return (
      proposeRoutes(db, now).find(
        (p) => p.walkIds.includes(walkId) && !isPromptHidden(db, p.key, now),
      ) ?? null
    );
  }, [db, walkId]);
  // which saved routes this walk went along, and how it compares with their other passes
  const routeLine = useMemo(() => {
    const found = walkRoutePasses(db, walkId, Date.now())[0];
    if (found === undefined) {
      return null;
    }
    const others = routePasses(db, found.route, Date.now()).filter((p) => p.walkId !== walkId);
    const versus = versusUsual(found.pass, others);
    const words =
      versus === null
        ? null
        : i18n.t(
            versus.kind === 'usual'
              ? 'routes.versusUsual'
              : versus.kind === 'longer'
                ? 'routes.versusLonger'
                : 'routes.versusShorter',
            { n: versus.minutes },
          );
    return words === null
      ? i18n.t('routes.thisWalk', { name: found.route.name, n: found.index })
      : i18n.t('routes.thisWalkVs', { name: found.route.name, n: found.index, versus: words });
  }, [db, walkId, i18n]);
  const cut = useMemo(
    () =>
      isPromptHidden(db, `walk-cut:${walkId}`, Date.now())
        ? null
        : walkCutSuggestion(db, walkId, Date.now()),
    [db, walkId, cutDone],
  );
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
    // a spot where walks keep starting and ending, and this one did too: is it home?
    const base = proposeBases(db, now).find(
      (p) => p.walkIds.includes(walkId) && !isPromptHidden(db, p.key, now),
    );
    if (base !== undefined) {
      return {
        kind: 'base',
        at: { lat: base.lat, lon: base.lon },
        category: 'home',
        radiusM: null,
        walkIds: [],
        key: base.key,
        basePlace:
          base.placeId === null || base.placeName === null
            ? undefined
            : { id: base.placeId, name: base.placeName },
      };
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
    if (card?.kind === 'cluster' || card?.kind === 'base') {
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
        map={
          <View style={{ gap: 8 }}>
            <WalkRouteMap walkId={walk.id} mode="fit" height={220} />
            <ReplayButton walkId={walk.id} />
          </View>
        }
        photos={<WalkPhotos walkId={walk.id} autoFind />}
        summary={{
          facts: walkFacts(walk, i18n),
          eventsLine: eventsLine === '' ? null : eventsLine,
        }}
        cutCard={
          cut === null || cutDone
            ? null
            : {
                text:
                  cut.kind === 'trim'
                    ? i18n.t('cut.trimText', {
                        place: cut.placeName,
                        stay: i18n.formatDuration(Math.round(cut.stayS)),
                        time: i18n.formatTime(cut.at),
                      })
                    : i18n.t('cut.splitText', {
                        place: cut.placeName,
                        stay: i18n.formatDuration(Math.round(cut.stayS)),
                      }),
                actionLabel:
                  cut.kind === 'trim'
                    ? i18n.t('cut.trim', { time: i18n.formatTime(cut.at) })
                    : i18n.t('cut.split'),
                keepLabel: i18n.t('cut.keep'),
              }
        }
        usual={usual}
        routeLine={routeLine}
        routeCard={
          routeProposal === null || routeDismissed
            ? null
            : {
                text: i18n.t('routes.suggest'),
                facts: i18n.t('routes.suggestFacts', {
                  length: i18n.formatDistance(routeProposal.lengthM),
                  times: i18n.t('routes.times', { n: routeProposal.legCount }),
                }),
              }
        }
        onRouteName={() => {
          setRouteNaming(true);
        }}
        onRouteLater={() => {
          hidePrompt(db, ctx, 'route-suggest:daily', Date.now() + DAY);
          setRouteDismissed(true);
        }}
        onRouteNever={() => {
          if (routeProposal !== null) {
            hidePrompt(db, ctx, routeProposal.key, Date.now() + FOREVER);
          }
          setRouteDismissed(true);
        }}
        onCut={() => {
          if (cut === null) {
            return;
          }
          if (cut.kind === 'trim') {
            const { undo } = trimWalkEndUndoable(db, ctx, walkId, cut.at);
            setCutDone(true);
            bump();
            toast.show({
              message: i18n.t('cut.trimmed'),
              actionLabel: i18n.t('common.undo'),
              durationMs: 8000,
              onAction: () => {
                undo();
                setCutDone(false);
                bump();
              },
            });
            return;
          }
          const { undo } = splitWalkAroundStayUndoable(db, ctx, walkId, cut.arrivedAt, cut.leftAt);
          setCutDone(true);
          bump();
          toast.show({
            message: i18n.t('cut.splitted'),
            actionLabel: i18n.t('common.undo'),
            durationMs: 8000,
            onAction: () => {
              undo();
              setCutDone(false);
              bump();
            },
          });
        }}
        onCutKeep={() => {
          hidePrompt(db, ctx, `walk-cut:${walkId}`, Date.now() + FOREVER);
          setCutDone(true);
        }}
        placeCard={
          shown
            ? {
                text:
                  card.kind === 'base' && card.basePlace !== undefined
                    ? i18n.t('place.suggest.baseHere', { place: card.basePlace.name })
                    : i18n.t(
                        card.kind === 'type'
                          ? 'place.suggest.type'
                          : card.kind === 'base'
                            ? 'place.suggest.base'
                            : 'place.suggest.cluster',
                      ),
                canDecline: card.key !== null,
                ...(card.kind === 'base' && card.basePlace !== undefined
                  ? { actionLabel: i18n.t('place.suggest.makeHome') }
                  : {}),
              }
            : null
        }
        onPlaceName={() => {
          if (card?.kind === 'base' && card.basePlace !== undefined) {
            // the place is already named: it only becomes home
            updatePlace(db, ctx, card.basePlace.id, { category: 'home' });
            bump();
            setDismissed(true);
            toast.show({ message: i18n.t('place.suggest.madeHome') });
            return;
          }
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
      {routeProposal === null || !routeNaming ? null : (
        <NewRouteSheet
          visible
          suggestedName={
            suggestedRouteName(
              routeProposal.loop,
              routeProposal.startName,
              routeProposal.endName,
              i18n.t('routes.loopWord'),
            ) ?? ''
          }
          facts={i18n.t('routes.suggestFacts', {
            length: i18n.formatDistance(routeProposal.lengthM),
            times: i18n.t('routes.times', { n: routeProposal.legCount }),
          })}
          onSave={(name) => {
            createRoute(db, ctx, {
              name,
              points: routeProposal.line,
              startPlaceId: routeProposal.startPlaceId,
              endPlaceId: routeProposal.endPlaceId,
            });
            setRouteNaming(false);
            setRouteDismissed(true);
            bump();
            toast.show({ message: i18n.t('routes.saved') });
          }}
          onClose={() => {
            setRouteNaming(false);
          }}
        />
      )}
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
