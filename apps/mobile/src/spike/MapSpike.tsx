import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { buildTheme, darkenMapStyle, eventColorList } from '@pawquest/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const CENTER = { lat: 55.7558, lon: 37.6173 };
const ROUTE_VERTICES = 1500;
const MARKERS = 30;

type Scheme = 'light' | 'dark';
type LngLat = [number, number];

/** A looping walk of ~3 km with wiggles: deterministic, so runs are comparable. */
export function demoRoute(vertices: number): LngLat[] {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = metersPerDegLat * Math.cos((CENTER.lat * Math.PI) / 180);
  return Array.from({ length: vertices }, (_, i) => {
    const t = (i / (vertices - 1)) * 2 * Math.PI;
    const radius = 450 * (1 + 0.25 * Math.sin(5 * t)) + 12 * Math.sin(80 * t);
    return [
      CENTER.lon + (radius * Math.cos(t)) / metersPerDegLon,
      CENTER.lat + (radius * Math.sin(t)) / metersPerDegLat,
    ];
  });
}

export function MapSpike(props: { onBack: () => void }) {
  const [scheme, setScheme] = useState<Scheme>('light');
  const [lightStyle, setLightStyle] = useState<StyleSpecification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string>('загрузка стиля…');
  const [picked, setPicked] = useState<string>('Тапни по маркеру');
  const cameraRef = useRef<CameraRef>(null);

  const route = useMemo(() => demoRoute(ROUTE_VERTICES), []);
  const colors = eventColorList(buildTheme('forest', scheme).colors.events);

  useEffect(() => {
    const started = Date.now();
    fetch(STYLE_URL)
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((style) => {
        setLightStyle(style);
        setLoadedAt(`стиль получен за ${String(Date.now() - started)} мс`);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const mapStyle = useMemo(() => {
    if (lightStyle === null) {
      return null;
    }
    return scheme === 'dark' ? darkenMapStyle(lightStyle) : lightStyle;
  }, [lightStyle, scheme]);

  const lineGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: route },
    }),
    [route],
  );

  const markerPoints = useMemo(
    () =>
      Array.from({ length: MARKERS }, (_, i) => {
        const at = route[Math.floor((i / MARKERS) * (route.length - 1))] ?? route[0] ?? [0, 0];
        return { id: `m${String(i)}`, lngLat: at, kind: i % 7 };
      }),
    [route],
  );

  const west = Math.min(...route.map((p) => p[0]));
  const east = Math.max(...route.map((p) => p[0]));
  const south = Math.min(...route.map((p) => p[1]));
  const north = Math.max(...route.map((p) => p[1]));

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={props.onBack} style={styles.chip}>
          <Text style={styles.chipText}>← Назад</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setScheme((s) => (s === 'light' ? 'dark' : 'light'));
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{scheme === 'light' ? 'Светлая' : 'Тёмная'}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            cameraRef.current?.fitBounds([west, south, east, north], {
              padding: { top: 60, right: 40, bottom: 60, left: 40 },
              duration: 400,
            });
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>Весь маршрут</Text>
        </Pressable>
      </View>
      <Text style={styles.info}>
        {`маршрут ${String(route.length)} вершин · ${String(MARKERS)} маркеров · ${loadedAt}`}
      </Text>
      {error === null ? null : <Text style={styles.error}>{`ошибка стиля: ${error}`}</Text>}
      <Text style={styles.info}>{picked}</Text>

      {mapStyle === null ? null : (
        <MapView style={styles.map} mapStyle={mapStyle}>
          <Camera
            ref={cameraRef}
            initialViewState={{
              bounds: [west, south, east, north],
              padding: { top: 60, right: 40, bottom: 60, left: 40 },
            }}
          />
          <GeoJSONSource id="route" data={lineGeoJson}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': scheme === 'dark' ? '#0b0f0d' : '#ffffff', 'line-width': 8 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': scheme === 'dark' ? '#6fd0a0' : '#2f7d5b', 'line-width': 4.5 }}
            />
          </GeoJSONSource>
          {markerPoints.map((m) => (
            <Marker
              key={m.id}
              id={m.id}
              lngLat={m.lngLat}
              onPress={() => {
                setPicked(`маркер ${m.id}, тип ${String(m.kind)}`);
              }}
            >
              <View style={[styles.dot, { backgroundColor: colors[m.kind] }]} />
            </Marker>
          ))}
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48, backgroundColor: '#fff' },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  chip: {
    backgroundColor: '#E3EBE6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: { color: '#17201A', fontWeight: '600' },
  info: { paddingHorizontal: 12, color: '#445', fontSize: 13 },
  error: { paddingHorizontal: 12, color: '#b00020', fontSize: 13 },
  map: { flex: 1, marginTop: 6 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
});
