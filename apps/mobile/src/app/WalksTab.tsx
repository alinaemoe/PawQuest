import {
  EMPTY_FILTER,
  clearIndoor,
  countConditions,
  deleteFolder,
  filterFacets,
  filterOptions,
  filterWalks,
  listFolders,
  saveFolder,
  type WalkFilter,
  createManualWalk,
  getWalk,
  getWeatherSnapshot,
  listEventTypes,
  markIndoor,
  listWalksPage,
  restore,
  softDelete,
  updateWalk,
  walkChronology,
  walkEventIds,
  walkUsual,
  walkTotals,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  emptyReason,
  eventTypeLabel,
  filterSummary,
  groupWalksByDay,
  WalkFilterBar,
  WalkFilterSheet,
  IndoorSheet,
  type TimelineRow,
  timelineRows,
  usualModel,
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
import { View } from 'react-native';

import { useApp } from './AppContext';
import { GpxButton } from './ExportContainer';
import { ReplayButton } from './ReplayContainer';
import { WalkRouteMap } from './RouteMap';
import { WalksMapView } from './WalksMapView';
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
  const [filter, setFilter] = useState<WalkFilter>(EMPTY_FILTER);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  // the visit row whose "inside" mark is being decided
  const [indoorRow, setIndoorRow] = useState<TimelineRow | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    const filtered = countConditions(filter) > 0 ? filterWalks(db, dogId, filter, now) : null;
    const walks = filtered === null ? listWalksPage(db, dogId, PAGE * pages) : filtered.walks;
    const totals = walkTotals(db, dogId, now - 7 * DAY, now + DAY);
    return {
      groups: groupWalksByDay(walks, i18n, now),
      hasMore: filtered === null && walks.length === PAGE * pages,
      weekLine: filtered !== null || totals.count === 0 ? null : totalsLine(totals, i18n),
      found: filtered === null ? null : walks.length,
      pending: filtered?.pending ?? 0,
    };
  }, [db, dogId, pages, i18n, version, filter]);

  // the map shows up to 200 of the walks the filter gives, not only the page of the list
  const mapWalks = useMemo(
    () => (view === 'map' ? filterWalks(db, dogId, filter, Date.now(), 200).walks : []),
    [db, dogId, filter, view, version],
  );
  const folders = useMemo(() => listFolders(db), [db, version]);
  const options = useMemo(() => filterOptions(db, dogId), [db, dogId, version]);
  const facets = useMemo(
    () => (filtering ? filterFacets(db, dogId, filter, options, Date.now()) : null),
    [db, dogId, filter, options, filtering, version],
  );
  const typeLabelOf = useMemo(() => {
    const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
    return (id: string): string => eventTypeLabel(types.get(id), id, i18n);
  }, [db, i18n, version]);

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
      usual: usualModel(walkUsual(db, dogId, open.id), i18n),
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
        view={view}
        onView={setView}
        mapView={<WalksMapView walks={mapWalks} onOpen={setOpenId} />}
        filterBar={
          <WalkFilterBar
            folders={folders}
            activeFolderId={folderId}
            summary={filterSummary(filter, options, typeLabelOf, i18n)}
            found={data.found}
            onOpen={() => {
              setFiltering(true);
            }}
            onFolder={(id) => {
              const folder = folders.find((f) => f.id === id);
              if (folder !== undefined) {
                setFilter(folder.filter);
                setFolderId(id);
              }
            }}
            onReset={() => {
              setFilter(EMPTY_FILTER);
              setFolderId(null);
            }}
            onDeleteFolder={(id) => {
              deleteFolder(db, id);
              setFilter(EMPTY_FILTER);
              setFolderId(null);
              bump();
            }}
          />
        }
        filteredEmpty={
          countConditions(filter) > 0
            ? { title: i18n.t('filter.empty.title'), text: emptyReason(filter, data.pending, i18n) }
            : null
        }
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
      {facets === null ? null : (
        <WalkFilterSheet
          visible={filtering}
          filter={filter}
          options={options}
          facets={facets}
          totalsLine={`${i18n.formatDuration(facets.durationS)} · ${i18n.formatDistance(facets.distanceM)}`}
          typeLabel={typeLabelOf}
          onChange={(next) => {
            setFilter(next);
            setFolderId(null);
          }}
          onClose={() => {
            setFiltering(false);
          }}
          onReset={() => {
            setFilter(EMPTY_FILTER);
            setFolderId(null);
          }}
          onSaveFolder={(name) => {
            const folder = saveFolder(db, ctx, name, filter);
            setFolderId(folder.id);
            bump();
            toast.show({ message: i18n.t('filter.folderSaved', { name: folder.name }) });
          }}
        />
      )}
      <WalkDetailsSheet
        map={
          open === null ? null : (
            <View style={{ gap: 8 }}>
              <WalkRouteMap walkId={open.id} mode="fit" height={200} />
              <ReplayButton walkId={open.id} />
              <GpxButton walkId={open.id} />
            </View>
          )
        }
        photos={open === null ? null : <WalkPhotos walkId={open.id} />}
        onTimelineRow={setIndoorRow}
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
      {indoorRow === null || open === null ? null : (
        <IndoorSheet
          visible
          title={`${indoorRow.text} · ${indoorRow.time}`}
          marked={indoorRow.indoor}
          onMark={() => {
            markIndoor(db, ctx, open.id, indoorRow.fromTs, indoorRow.toTs);
            setIndoorRow(null);
            bump();
            toast.show({ message: i18n.t('indoor.marked') });
          }}
          onClear={() => {
            clearIndoor(db, ctx, open.id, indoorRow.fromTs, indoorRow.toTs);
            setIndoorRow(null);
            bump();
            toast.show({ message: i18n.t('indoor.cleared') });
          }}
          onClose={() => {
            setIndoorRow(null);
          }}
        />
      )}
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
