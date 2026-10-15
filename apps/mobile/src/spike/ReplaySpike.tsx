import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
} from '@maplibre/maplibre-react-native';
import { positionAt, type ReplayPoint } from '@pawquest/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { demoRoute } from './MapSpike';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const POINTS = 10_000;
const GAP_AT = 6000;
const GAP_MS = 120_000;
const BASE_TS = Date.UTC(2026, 9, 15, 8, 0, 0);

type Mode = 'marker' | 'layer';

/** 10k points, one point per second, with a 2-minute recording gap after point 6000. */
function buildPoints(): ReplayPoint[] {
  return demoRoute(POINTS).map(([lon, lat], i) => ({
    lat,
    lon,
    ts: BASE_TS + i * 1000 + (i >= GAP_AT ? GAP_MS : 0),
  }));
}

interface Stats {
  frames: number;
  sumDt: number;
  slow: number;
  maxDt: number;
  lookupMaxMs: number;
  since: number;
}

function freshStats(now: number): Stats {
  return { frames: 0, sumDt: 0, slow: 0, maxDt: 0, lookupMaxMs: 0, since: now };
}

/** The interpolation checks the spec asks for (A-05), run on the device in Hermes. */
function interpolationChecks(points: readonly ReplayPoint[]): string[] {
  const a = points[100];
  const b = points[101];
  const before = points[GAP_AT - 1];
  const after = points[GAP_AT];
  if (a === undefined || b === undefined || before === undefined || after === undefined) {
    return ['нет точек'];
  }
  const mid = positionAt(points, (a.ts + b.ts) / 2);
  const midOk =
    mid !== null &&
    Math.abs(mid.lat - (a.lat + b.lat) / 2) < 1e-9 &&
    Math.abs(mid.lon - (a.lon + b.lon) / 2) < 1e-9;
  const frozen = positionAt(points, before.ts + GAP_MS / 2);
  const frozenOk = frozen !== null && frozen.lat === before.lat && frozen.lon === before.lon;
  const afterPos = positionAt(points, after.ts);
  const afterOk = afterPos !== null && afterPos.lat === after.lat;
  return [
    `${midOk ? '✓' : '✗'} середина интервала = среднее точек`,
    `${frozenOk ? '✓' : '✗'} в пропуске позиция замирает`,
    `${afterOk ? '✓' : '✗'} после пропуска позиция точная`,
  ];
}

export function ReplaySpike(props: { onBack: () => void }) {
  const points = useMemo(buildPoints, []);
  const checks = useMemo(() => interpolationChecks(points), [points]);
  const [mode, setMode] = useState<Mode>('marker');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(120);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [report, setReport] = useState('не запущено');
  const virtualRef = useRef(BASE_TS);
  const mapFramesRef = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    let raf = 0;
    let last = performance.now();
    let stats = freshStats(last);
    const endTs = points[points.length - 1]?.ts ?? BASE_TS;

    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      stats.frames += 1;
      stats.sumDt += dt;
      stats.maxDt = Math.max(stats.maxDt, dt);
      if (dt > 20) {
        stats.slow += 1;
      }
      virtualRef.current = Math.min(endTs, virtualRef.current + dt * speedRef.current);
      const lookupStart = performance.now();
      const p = positionAt(points, virtualRef.current);
      stats.lookupMaxMs = Math.max(stats.lookupMaxMs, performance.now() - lookupStart);
      if (p !== null) {
        setPos(p);
      }
      const elapsed = now - stats.since;
      if (elapsed >= 1000) {
        const mapFps = (mapFramesRef.current * 1000) / elapsed;
        mapFramesRef.current = 0;
        setReport(
          `карта ${mapFps.toFixed(1)} к/с · JS ${((stats.frames * 1000) / elapsed).toFixed(1)} к/с · среднее ${(stats.sumDt / stats.frames).toFixed(1)} мс · ` +
            `макс ${stats.maxDt.toFixed(0)} мс · кадров >20 мс: ${String(stats.slow)} · поиск позиции макс ${stats.lookupMaxMs.toFixed(2)} мс`,
        );
        stats = freshStats(now);
      }
      if (virtualRef.current >= endTs) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, points]);

  const lineGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: points.map((p): [number, number] => [p.lon, p.lat]),
      },
    }),
    [points],
  );
  const dotGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Point' as const,
        coordinates: [pos?.lon ?? points[0]?.lon ?? 0, pos?.lat ?? points[0]?.lat ?? 0],
      },
    }),
    [pos, points],
  );

  const progress = Math.round(
    ((virtualRef.current - BASE_TS) / ((points[points.length - 1]?.ts ?? BASE_TS) - BASE_TS)) * 100,
  );

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={props.onBack} style={styles.chip}>
          <Text style={styles.chipText}>← Назад</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setPlaying((v) => !v);
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{playing ? 'Пауза' : 'Играть'}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            virtualRef.current = BASE_TS;
            setPos(null);
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>В начало</Text>
        </Pressable>
      </View>
      <View style={styles.bar}>
        {[30, 120, 600].map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              setSpeed(s);
            }}
            style={[styles.chip, speed === s && styles.chipOn]}
          >
            <Text style={styles.chipText}>{`×${String(s)}`}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setMode((m) => (m === 'marker' ? 'layer' : 'marker'));
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{mode === 'marker' ? 'Маркер' : 'Слой'}</Text>
        </Pressable>
      </View>
      <Text style={styles.info}>{`${String(POINTS)} точек · прогресс ${String(progress)}%`}</Text>
      <Text style={styles.info}>{report}</Text>
      <Text style={styles.info}>{checks.join('  ')}</Text>

      {
        <MapView
          style={styles.map}
          mapStyle={STYLE_URL}
          onDidFinishRenderingFrame={() => {
            mapFramesRef.current += 1;
          }}
        >
          <Camera
            initialViewState={{
              center: [points[0]?.lon ?? 0, points[0]?.lat ?? 0],
              zoom: 14.2,
            }}
          />
          <GeoJSONSource id="route" data={lineGeoJson}>
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#2f7d5b', 'line-width': 3 }}
            />
          </GeoJSONSource>
          {mode === 'layer' ? (
            <GeoJSONSource id="dot" data={dotGeoJson}>
              <Layer
                id="dot-circle"
                type="circle"
                paint={{
                  'circle-radius': 9,
                  'circle-color': '#d1701f',
                  'circle-stroke-color': '#fff',
                  'circle-stroke-width': 2,
                }}
              />
            </GeoJSONSource>
          ) : pos === null ? null : (
            <Marker id="dog" lngLat={[pos.lon, pos.lat]}>
              <View style={styles.dot} />
            </Marker>
          )}
        </MapView>
      }
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
  chipOn: { backgroundColor: '#9fd2b8' },
  chipText: { color: '#17201A', fontWeight: '600' },
  info: { paddingHorizontal: 12, color: '#445', fontSize: 12 },
  map: { flex: 1, marginTop: 6 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#d1701f',
    borderWidth: 3,
    borderColor: '#fff',
  },
});
