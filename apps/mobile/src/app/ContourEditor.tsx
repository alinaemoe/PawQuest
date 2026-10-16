import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
} from '@maplibre/maplibre-react-native';
import { circleRing, type LatLon } from '@pawquest/core';
import { AppText, Button, Chip, useI18n, useTheme } from '@pawquest/rn-ui';
import { formatArea, insertVertex, moveVertex, removeVertex, ringState } from '@pawquest/screens';
import { darkenMapStyle } from '@pawquest/ui';
import { useMemo, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMapStyle } from './useMapStyle';

export interface ContourEditorProps {
  /** The place the outline is for: where the map opens when there is no outline yet. */
  readonly centre: LatLon;
  /** The radius of the place, for the "Circle" shortcut. */
  readonly radiusM: number;
  /** The outline to start from (from the map, or the saved one); empty to draw from nothing. */
  readonly initial: readonly LatLon[];
  readonly onDone: (ring: readonly LatLon[]) => void;
  readonly onClose: () => void;
}

/**
 * Drawing the boundary of a place on the map: tap along its edge, tap a point to pick it up and
 * tap elsewhere to put it down (or tap it again to remove it). Few controls: undo, clear, circle.
 */
export function ContourEditor({ centre, radiusM, initial, onDone, onClose }: ContourEditorProps) {
  const i18n = useI18n();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { style: light, failed } = useMapStyle();
  const [ring, setRing] = useState<LatLon[]>([...initial]);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<LatLon[][]>([]);
  // a tap on a point must not also be taken as a tap on the map under it
  const ignoreMapUntil = useRef(0);

  const state = ringState(ring);
  const mapStyle = useMemo(
    () => (light === null ? null : theme.scheme === 'dark' ? darkenMapStyle(light) : light),
    [light, theme.scheme],
  );

  const change = (next: LatLon[]): void => {
    setHistory((h) => [...h.slice(-30), ring]);
    setRing(next);
    setSelected(null);
  };

  const onMapPress = (lngLat: readonly number[]): void => {
    if (Date.now() < ignoreMapUntil.current) {
      return;
    }
    const point = { lat: lngLat[1] ?? 0, lon: lngLat[0] ?? 0 };
    change(selected === null ? insertVertex(ring, point) : moveVertex(ring, selected, point));
  };

  const coordinates = ring.map((p): [number, number] => [p.lon, p.lat]);
  const first = coordinates[0];
  const area =
    ring.length >= 3 && first !== undefined
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [[...coordinates, first]] },
        }
      : null;
  const line =
    ring.length >= 2 && first !== undefined
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: [...coordinates, ...(ring.length >= 3 ? [first] : [])],
          },
        }
      : null;

  const bounds =
    ring.length >= 2
      ? ([
          Math.min(...coordinates.map((c) => c[0])),
          Math.min(...coordinates.map((c) => c[1])),
          Math.max(...coordinates.map((c) => c[0])),
          Math.max(...coordinates.map((c) => c[1])),
        ] as [number, number, number, number])
      : null;

  const hint =
    ring.length === 0
      ? i18n.t('contour.editor.hintEmpty')
      : selected === null
        ? i18n.t('contour.editor.hint')
        : i18n.t('contour.editor.hintSelected');
  const problem =
    ring.length >= 3 && state.problem !== null ? i18n.t(`contour.problem.${state.problem}`) : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Chip size="sm" label={i18n.t('contour.editor.cancel')} onPress={onClose} />
          <AppText weight={600}>{ring.length >= 3 ? formatArea(state.areaM2, i18n) : ''}</AppText>
        </View>

        <View style={{ flex: 1 }}>
          {mapStyle === null ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <AppText variant="muted" style={{ textAlign: 'center' }}>
                {failed ? i18n.t('map.offline') : i18n.t('map.loading')}
              </AppText>
            </View>
          ) : (
            <MapView
              style={{ flex: 1 }}
              mapStyle={mapStyle}
              logo={false}
              attribution
              onPress={(e) => {
                onMapPress(e.nativeEvent.lngLat);
              }}
            >
              <Camera
                initialViewState={
                  bounds !== null
                    ? { bounds, padding: { top: 60, right: 40, bottom: 60, left: 40 } }
                    : { center: [centre.lon, centre.lat], zoom: 16 }
                }
              />
              {area !== null ? (
                <GeoJSONSource id="contour-area" data={area}>
                  <Layer
                    id="contour-fill"
                    type="fill"
                    paint={{ 'fill-color': theme.colors.accent, 'fill-opacity': 0.22 }}
                  />
                </GeoJSONSource>
              ) : null}
              {line !== null ? (
                <GeoJSONSource id="contour-line" data={line}>
                  <Layer
                    id="contour-stroke"
                    type="line"
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{ 'line-color': theme.colors.accent, 'line-width': 3 }}
                  />
                </GeoJSONSource>
              ) : null}
              {ring.map((p, index) => (
                <Marker
                  key={`${String(index)}-${String(p.lat)}-${String(p.lon)}`}
                  id={`v${String(index)}`}
                  lngLat={[p.lon, p.lat]}
                  onPress={() => {
                    ignoreMapUntil.current = Date.now() + 400;
                    if (selected === index) {
                      change(removeVertex(ring, index));
                    } else {
                      setSelected(index);
                    }
                  }}
                >
                  <View
                    style={{
                      width: selected === index ? 26 : 20,
                      height: selected === index ? 26 : 20,
                      borderRadius: 13,
                      backgroundColor: selected === index ? theme.colors.accent : '#fff',
                      borderWidth: 3,
                      borderColor: theme.colors.accent,
                    }}
                  />
                </Marker>
              ))}
            </MapView>
          )}
        </View>

        <View
          style={{
            padding: 16,
            paddingBottom: insets.bottom + 16,
            gap: 10,
            backgroundColor: theme.colors.surface,
          }}
        >
          <AppText variant="muted">{hint}</AppText>
          {problem === null ? null : (
            <AppText style={{ color: theme.colors.events.hard }}>{problem}</AppText>
          )}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip
              size="sm"
              label={i18n.t('contour.editor.undo')}
              onPress={() => {
                const previous = history[history.length - 1];
                if (previous !== undefined) {
                  setHistory((h) => h.slice(0, -1));
                  setRing(previous);
                  setSelected(null);
                }
              }}
            />
            <Chip
              size="sm"
              label={i18n.t('contour.editor.circle')}
              onPress={() => {
                change(
                  circleRing(ring.length >= 3 ? centreOf(ring) : centre, Math.max(radiusM, 30)),
                );
              }}
            />
            <Chip
              size="sm"
              label={i18n.t('contour.editor.clear')}
              onPress={() => {
                if (ring.length > 0) {
                  change([]);
                }
              }}
            />
          </View>
          <Button
            label={i18n.t('contour.editor.done')}
            size="lg"
            disabled={!state.ok}
            onPress={() => {
              onDone(ring);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function centreOf(ring: readonly LatLon[]): LatLon {
  const lat = ring.reduce((sum, p) => sum + p.lat, 0) / ring.length;
  const lon = ring.reduce((sum, p) => sum + p.lon, 0) / ring.length;
  return { lat, lon };
}
