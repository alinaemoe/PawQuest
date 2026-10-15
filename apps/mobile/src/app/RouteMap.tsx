import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { filterTrack, simplifyTrack } from '@pawquest/core';
import { listEventTypes, listTrackPoints } from '@pawquest/data';
import { AppText, useI18n, useTheme, type EventKind } from '@pawquest/rn-ui';
import { darkenMapStyle } from '@pawquest/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useApp } from './AppContext';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
let styleCache: StyleSpecification | null = null;

type Shape = 'circle' | 'triangle' | 'diamond' | 'square' | 'star';
const SHAPES: Readonly<Record<EventKind, Shape>> = {
  dog: 'circle',
  person: 'circle',
  animal: 'circle',
  child: 'triangle',
  ok: 'star',
  hard: 'diamond',
  ex: 'square',
};

/** Same shape and color as the event's button, so a marker is recognisable without a legend. */
function EventMarkerShape({ kind, color }: { kind: EventKind; color: string }) {
  const shape = SHAPES[kind];
  if (shape === 'triangle') {
    return (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 9,
          borderRightWidth: 9,
          borderBottomWidth: 16,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    );
  }
  if (shape === 'star') {
    return (
      <AppText style={{ color, fontSize: 22, lineHeight: 24 }} accessibilityElementsHidden>
        ★
      </AppText>
    );
  }
  return (
    <View
      style={{
        width: shape === 'diamond' ? 14 : 16,
        height: shape === 'diamond' ? 14 : 16,
        borderRadius: shape === 'circle' ? 8 : 3,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: '#fff',
        transform: shape === 'diamond' ? [{ rotate: '45deg' }] : [],
      }}
    />
  );
}

export interface WalkRouteMapProps {
  readonly walkId: string;
  /** `follow` keeps the latest position in view (Active Walk); `fit` frames the whole route. */
  readonly mode: 'follow' | 'fit';
  readonly height?: number;
  /** Changes when the track may have changed, to refresh the line. */
  readonly refreshKey?: number;
}

/**
 * The route of a walk on an OpenFreeMap map: the filtered, simplified track, a marker for each
 * event that has a position, and a dark style in the dark theme. Without a network it shows a
 * quiet note instead of an error (G-13).
 */
export function WalkRouteMap({ walkId, mode, height = 190, refreshKey = 0 }: WalkRouteMapProps) {
  const { db, version } = useApp();
  const i18n = useI18n();
  const { theme } = useTheme();
  const [light, setLight] = useState<StyleSpecification | null>(styleCache);
  const [failed, setFailed] = useState(false);
  const camera = useRef<CameraRef>(null);

  useEffect(() => {
    if (styleCache !== null) {
      return;
    }
    fetch(STYLE_URL)
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((style) => {
        styleCache = style;
        setLight(style);
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  const route = useMemo(() => {
    const points = filterTrack(listTrackPoints(db, walkId)).points;
    const keep =
      points.length < 2 ? points.map((_, i) => i) : simplifyTrack(points, { epsilonM: 2 });
    const coordinates = keep.map((i): [number, number] => [
      points[i]?.lon ?? 0,
      points[i]?.lat ?? 0,
    ]);
    const markers = db
      .all(
        'SELECT id, type_id, lat, lon FROM event WHERE walk_id = ? AND lat IS NOT NULL AND lon IS NOT NULL AND deleted_at IS NULL',
        [walkId],
      )
      .map((row) => ({
        id: String(row['id']),
        typeId: String(row['type_id']),
        lngLat: [Number(row['lon']), Number(row['lat'])] as [number, number],
      }));
    const types = new Map(listEventTypes(db).map((t) => [t.id, t]));
    return { coordinates, markers, types, last: coordinates[coordinates.length - 1] };
  }, [db, walkId, refreshKey, version]);

  useEffect(() => {
    if (mode === 'follow' && route.last !== undefined) {
      camera.current?.easeTo({ center: route.last, zoom: 16.5, duration: 600 });
    }
  }, [mode, route.last]);

  const style = useMemo(
    () => (light === null ? null : theme.scheme === 'dark' ? darkenMapStyle(light) : light),
    [light, theme.scheme],
  );

  const frame = {
    height,
    borderRadius: 20,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.map.bg,
  };

  if (style === null) {
    return (
      <View style={[frame, { alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
        <AppText variant="muted" style={{ textAlign: 'center' }}>
          {failed ? i18n.t('map.offline') : i18n.t('map.loading')}
        </AppText>
      </View>
    );
  }

  const first = route.coordinates[0];
  const bounds =
    route.coordinates.length >= 2
      ? ([
          Math.min(...route.coordinates.map((c) => c[0])),
          Math.min(...route.coordinates.map((c) => c[1])),
          Math.max(...route.coordinates.map((c) => c[0])),
          Math.max(...route.coordinates.map((c) => c[1])),
        ] as [number, number, number, number])
      : null;

  return (
    <View style={frame}>
      <MapView style={{ flex: 1 }} mapStyle={style} logo={false} attribution>
        <Camera
          ref={camera}
          initialViewState={
            mode === 'fit' && bounds !== null
              ? { bounds, padding: { top: 30, right: 30, bottom: 30, left: 30 } }
              : { center: route.last ?? first ?? [37.6173, 55.7558], zoom: 16.5 }
          }
        />
        {route.coordinates.length >= 2 ? (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: route.coordinates },
            }}
          >
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': theme.scheme === 'dark' ? '#0b0f0d' : '#ffffff',
                'line-width': 8,
              }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': theme.colors.accent, 'line-width': 4.5 }}
            />
          </GeoJSONSource>
        ) : null}
        {route.markers.map((marker) => {
          const color = route.types.get(marker.typeId)?.color ?? 'ex';
          const kind = (color in SHAPES ? color : 'ex') as EventKind;
          return (
            <Marker key={marker.id} id={marker.id} lngLat={marker.lngLat}>
              <EventMarkerShape kind={kind} color={theme.colors.events[kind]} />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}
