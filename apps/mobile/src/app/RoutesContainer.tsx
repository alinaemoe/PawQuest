import {
  deleteRoute,
  listPlaces,
  listRoutes,
  renameRoute,
  restore,
  routePasses,
  type Route,
  type RoutePass,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  RouteDetailsSheet,
  RoutesScreen,
  routeStats,
  type RouteDetailsModel,
  type RouteRowModel,
} from '@pawquest/screens';
import type { I18n } from '@pawquest/i18n';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

/** "5 проходов, обычно 11 мин (9–14)" and the like, for a route and its passes. */
export function usualText(i18n: I18n, passes: readonly RoutePass[]): string {
  const stats = routeStats(passes);
  if (stats.count === 0 || stats.medianS === null || stats.minS === null || stats.maxS === null) {
    return '';
  }
  return i18n.t(stats.fewData ? 'routes.statsFew' : 'routes.stats', {
    passes: i18n.t('routes.passCount', { n: stats.count }),
    usual: i18n.formatDuration(Math.round(stats.medianS)),
    min: i18n.formatDuration(Math.round(stats.minS)),
    max: i18n.formatDuration(Math.round(stats.maxS)),
  });
}

/** Dog -> Routes: the list, one route with its passes, rename and delete (with undo). */
export function RoutesContainer({ onBack }: { onBack: () => void }) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    return listRoutes(db).map((route) => ({ route, passes: routePasses(db, route, now) }));
  }, [db, version]);

  const rows: RouteRowModel[] = data.map(({ route, passes }) => {
    const stats = routeStats(passes);
    return {
      id: route.id,
      name: route.name,
      summary:
        stats.medianS === null
          ? i18n.t('routes.rowNone', { length: i18n.formatDistance(route.lengthM) })
          : i18n.t('routes.row', {
              length: i18n.formatDistance(route.lengthM),
              passes: i18n.t('routes.passCount', { n: stats.count }),
              usual: i18n.formatDuration(Math.round(stats.medianS)),
            }),
    };
  });

  const details = useMemo<RouteDetailsModel | null>(() => {
    const found = data.find((d) => d.route.id === openId);
    if (found === undefined) {
      return null;
    }
    const { route, passes } = found;
    const stats = routeStats(passes);
    const names = new Map(listPlaces(db).map((p) => [p.id, p.name]));
    const ends = (r: Route): string =>
      r.kind === 'loop'
        ? i18n.t('routes.loopLine')
        : i18n.t('routes.length', {
            length: i18n.formatDistance(r.lengthM),
            from: (r.startPlaceId === null ? undefined : names.get(r.startPlaceId)) ?? '…',
            to: (r.endPlaceId === null ? undefined : names.get(r.endPlaceId)) ?? '…',
          });
    return {
      id: route.id,
      name: route.name,
      lengthLine:
        route.kind === 'loop'
          ? `${i18n.formatDistance(route.lengthM)} · ${ends(route)}`
          : ends(route),
      statsLine: passes.length === 0 ? i18n.t('routes.noPasses') : usualText(i18n, passes),
      directionsLine:
        route.kind === 'loop'
          ? ''
          : i18n.t(stats.withStops > 0 ? 'routes.directionsStops' : 'routes.directions', {
              forward: stats.forward,
              backward: stats.backward,
              stops: stats.withStops,
            }),
      passes: passes.map((pass) => ({
        key: `${pass.walkId}-${String(pass.fromTs)}`,
        when: `${i18n.formatLongDate(pass.fromTs)} · ${i18n.formatTime(pass.fromTs)}`,
        detail: [
          i18n.formatDuration(pass.walkingS),
          route.kind === 'loop'
            ? null
            : i18n.t(pass.direction === 'forward' ? 'routes.forward' : 'routes.backward'),
          pass.stops > 0 ? i18n.t('routes.stopCount', { n: pass.stops }) : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
      })),
    };
  }, [data, openId, db, i18n]);

  return (
    <>
      <RoutesScreen routes={rows} onBack={onBack} onOpen={setOpenId} />
      <RouteDetailsSheet
        route={details}
        onClose={() => {
          setOpenId(null);
        }}
        onRename={(name) => {
          if (openId !== null && name.trim() !== '') {
            renameRoute(db, ctx, openId, name);
            bump();
          }
        }}
        onDelete={() => {
          if (openId === null) {
            return;
          }
          const id = openId;
          deleteRoute(db, ctx, id);
          setOpenId(null);
          bump();
          toast.show({
            message: i18n.t('routes.deleted'),
            actionLabel: i18n.t('common.undo'),
            durationMs: 8000,
            onAction: () => {
              restore(db, ctx, 'route', id);
              bump();
            },
          });
        }}
      />
    </>
  );
}
