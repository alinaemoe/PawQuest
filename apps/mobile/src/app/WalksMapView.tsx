import { Camera, GeoJSONSource, Layer, Map as MapView } from '@maplibre/maplibre-react-native';
import { walkLines, type WalkLine } from '@pawquest/data';
import { AppText, Button, Card, useI18n, useTheme } from '@pawquest/rn-ui';
import { linesBounds, nearestWalk } from '@pawquest/screens';
import { darkenMapStyle } from '@pawquest/ui';
import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useApp } from './AppContext';
import { useMapStyle } from './useMapStyle';

/** A tap this close to a route (metres) is a tap on it; wide enough for a finger on a city map. */
const TAP_METERS = 35;

export interface WalksMapViewProps {
  /** The walks to draw, newest first (the filtered list). */
  readonly walks: readonly { readonly id: string; readonly startedAt: number }[];
  readonly onOpen: (walkId: string) => void;
}

/**
 * Every route of the filtered walks on one map (docs/23, step 3.18): thin lines that pile up where
 * the habits are, a tap picks the nearest route and offers its walk.
 */
export function WalksMapView({ walks, onOpen }: WalksMapViewProps) {
  const { db, i18n: appI18n, version } = useApp();
  const i18n = useI18n();
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const { style: light, failed } = useMapStyle();
  const [picked, setPicked] = useState<string | null>(null);

  const lines = useMemo<WalkLine[]>(() => walkLines(db, walks), [db, walks, version]);
  const bounds = useMemo(() => linesBounds(lines), [lines]);
  const style = useMemo(
    () => (light === null ? null : theme.scheme === 'dark' ? darkenMapStyle(light) : light),
    [light, theme.scheme],
  );
  const pickedLine = lines.find((l) => l.walkId === picked) ?? null;
  const pickedWalk = walks.find((w) => w.id === picked) ?? null;
  const mapHeight = Math.round(height * 0.5);
  const colors = theme.colors;

  const frame = {
    height: mapHeight,
    borderRadius: 20,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.map.bg,
  };

  if (lines.length === 0) {
    return (
      <Card variant="soft">
        <AppText>{i18n.t('walks.map.empty')}</AppText>
      </Card>
    );
  }
  if (style === null) {
    return (
      <View style={[frame, { alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
        <AppText variant="muted" style={{ textAlign: 'center' }}>
          {failed ? i18n.t('map.offline') : i18n.t('map.loading')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={frame}>
        <MapView
          style={{ flex: 1 }}
          mapStyle={style}
          logo={false}
          attribution
          onPress={(e) => {
            const [lon, lat] = e.nativeEvent.lngLat;
            setPicked(nearestWalk(lines, [lon, lat], TAP_METERS));
          }}
        >
          <Camera
            initialViewState={
              bounds === null
                ? { center: [37.6173, 55.7558], zoom: 11 }
                : { bounds, padding: { top: 40, right: 40, bottom: 40, left: 40 } }
            }
          />
          <GeoJSONSource
            id="walks-all"
            data={{
              type: 'FeatureCollection',
              features: lines.map((l) => ({
                type: 'Feature' as const,
                properties: { id: l.walkId },
                geometry: {
                  type: 'LineString' as const,
                  coordinates: l.coordinates.map((c) => [...c]),
                },
              })),
            }}
          >
            <Layer
              id="walks-all-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.accent, 'line-width': 3, 'line-opacity': 0.4 }}
            />
          </GeoJSONSource>
          {pickedLine === null ? null : (
            <GeoJSONSource
              id="walks-picked"
              data={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: pickedLine.coordinates.map((c) => [...c]),
                },
              }}
            >
              <Layer
                id="walks-picked-casing"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': theme.scheme === 'dark' ? '#0b0f0d' : '#ffffff',
                  'line-width': 9,
                }}
              />
              <Layer
                id="walks-picked-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': colors.accent, 'line-width': 5 }}
              />
            </GeoJSONSource>
          )}
        </MapView>
      </View>
      <AppText variant="muted">
        {i18n.t('walks.map.count', { n: lines.length })}
        {lines.length < walks.length
          ? ` · ${i18n.t('walks.map.noTrack', { n: walks.length - lines.length })}`
          : ''}
      </AppText>
      {pickedWalk === null ? (
        <AppText variant="muted">{i18n.t('walks.map.hint')}</AppText>
      ) : (
        <Card variant="stripe">
          <AppText weight={600}>
            {appI18n.formatLongDate(pickedWalk.startedAt)} ·{' '}
            {appI18n.formatTime(pickedWalk.startedAt)}
          </AppText>
          <Button
            label={i18n.t('walks.map.open')}
            onPress={() => {
              onOpen(pickedWalk.id);
            }}
          />
        </Card>
      )}
    </View>
  );
}
