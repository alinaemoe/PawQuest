import {
  createManualWalk,
  getWalk,
  getWeatherSnapshot,
  listEventTypes,
  listWalksPage,
  restore,
  softDelete,
  updateWalk,
  walkChronology,
  walkEventIds,
  walkTotals,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  eventTypeLabel,
  groupWalksByDay,
  timelineRows,
  totalsLine,
  walkFacts,
  WalkDetailsSheet,
  WalkEditSheet,
  WalksScreen,
  WalkSheet,
  type ManualWalk,
  type WalkDetailsModel,
  weatherLine,
} from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { WalkRouteMap } from './RouteMap';
import { WalkPhotos } from './WalkPhotos';

const PAGE = 30;
const DAY = 86_400_000;

/** The Walks tab: history by day, details with edit and delete, and logging a walk by hand. */
export function WalksTab() {
  const { db, ctx, dog, settings, i18n, version, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  const [pages, setPages] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);

  const data = useMemo(() => {
    const now = Date.now();
    const walks = listWalksPage(db, dogId, PAGE * pages);
    const totals = walkTotals(db, dogId, now - 7 * DAY, now + DAY);
    return {
      groups: groupWalksByDay(walks, i18n, now),
      hasMore: walks.length === PAGE * pages,
      weekLine: totals.count === 0 ? null : totalsLine(totals, i18n),
    };
  }, [db, dogId, pages, i18n, version]);

  const open = useMemo(() => (openId === null ? null : getWalk(db, openId)), [db, openId, version]);
  const details = useMemo<WalkDetailsModel | null>(() => {
    if (open === null) {
      return null;
    }
    const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
    const chrono = open.mode === 'gps' ? walkChronology(db, open.id, Date.now()) : null;
    return {
      id: open.id,
      whenText: `${i18n.formatLongDate(open.startedAt)} · ${i18n.formatTime(open.startedAt)}`,
      facts: walkFacts(open, i18n),
      events: walkEventIds(db, open.id).map((e) => ({
        label: eventTypeLabel(types.get(e.typeId), e.typeId, i18n),
        time: i18n.formatTime(e.ts),
      })),
      notes: open.notes,
      weather: (() => {
        const facts = getWeatherSnapshot(db, open.id);
        return facts === null ? null : weatherLine(facts, i18n);
      })(),
      manual: open.mode === 'manual',
      route: chrono?.title ?? null,
      timeline: chrono === null ? [] : timelineRows(chrono.steps, chrono.placeNames, i18n),
    };
  }, [db, open, i18n]);

  const remove = (id: string): void => {
    softDelete(db, ctx, 'walk', id);
    setOpenId(null);
    bump();
    toast.show({
      message: i18n.t('walk.deleted'),
      actionLabel: i18n.t('common.undo'),
      durationMs: 8000,
      onAction: () => {
        restore(db, ctx, 'walk', id);
        bump();
      },
    });
  };

  const unitsKm = settings.units === 'imperial' ? 1609.344 : 1000;

  return (
    <>
      <WalksScreen
        weekLine={data.weekLine}
        groups={data.groups}
        hasMore={data.hasMore}
        onLoadMore={() => {
          setPages((p) => p + 1);
        }}
        onOpen={setOpenId}
        onLogWalk={() => {
          setLogging(true);
        }}
      />
      <WalkDetailsSheet
        map={open === null ? null : <WalkRouteMap walkId={open.id} mode="fit" height={200} />}
        photos={open === null ? null : <WalkPhotos walkId={open.id} />}
        walk={editing ? null : details}
        onClose={() => {
          setOpenId(null);
        }}
        onEdit={() => {
          setEditing(true);
        }}
        onDelete={() => {
          if (open !== null) {
            remove(open.id);
          }
        }}
      />
      <WalkEditSheet
        visible={editing && open !== null}
        units={settings.units}
        initial={{
          durationMin: Math.max(1, Math.round((open?.durationS ?? 0) / 60)),
          distanceText:
            open?.distanceM == null
              ? ''
              : String(Math.round((open.distanceM / unitsKm) * 100) / 100),
          notes: open?.notes ?? '',
          mood: open?.mood ?? null,
        }}
        onClose={() => {
          setEditing(false);
        }}
        onSave={(edit) => {
          if (open !== null) {
            updateWalk(db, ctx, open.id, {
              durationS: edit.durationMin * 60,
              distanceM: edit.distanceM,
              notes: edit.notes,
              mood: edit.mood,
            });
            bump();
            toast.show({ message: i18n.t('walk.updated') });
          }
          setEditing(false);
        }}
      />
      <WalkSheet
        visible={logging}
        units={settings.units}
        onClose={() => {
          setLogging(false);
        }}
        onSave={(walk: ManualWalk) => {
          const endedAt = ctx.now() - walk.endedAgoMs;
          createManualWalk(db, ctx, {
            dogId,
            startedAt: endedAt - walk.durationMin * 60_000,
            durationS: walk.durationMin * 60,
            distanceM: walk.distanceM,
            tzOffsetMin: -new Date().getTimezoneOffset(),
          });
          setLogging(false);
          bump();
          toast.show({ message: i18n.t('walk.saved') });
        }}
      />
    </>
  );
}
