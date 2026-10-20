import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { simplifyTrack } from '@pawquest/core';
import { compareCandidates, walkReplay, type WalkReplay } from '@pawquest/data';
import { AppText, Button, Sheet, useI18n, useTheme } from '@pawquest/rn-ui';
import {
  CandidateList,
  COMPARE_PAINT,
  CompareControls,
  compareAxis,
  compareRows,
  compareSide,
  CompareTable,
  leadText,
  liveRows,
  ReplaySlider,
  type CompareSide,
  type CompareSync,
} from '@pawquest/screens';
import { darkenMapStyle } from '@pawquest/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from './AppContext';
import { useMapStyle } from './useMapStyle';

const TICK_MS = 100;

type LngLat = [number, number];

const lineOf = (replay: WalkReplay): LngLat[] =>
  simplifyTrack(replay.points, { epsilonM: 3 }).flatMap((i) => {
    const p = replay.points[i];
    return p === undefined ? [] : [[p.lon, p.lat] as LngLat];
  });

/** The part of a line the walk has covered at a moment, ending at the marker. */
function walkedLine(replay: WalkReplay, wallTs: number, at: LngLat): LngLat[] {
  const done = replay.points.filter((p) => p.ts <= wallTs).map((p) => [p.lon, p.lat] as LngLat);
  const line = [...done, at];
  return line.length < 2 ? [...line, ...line] : line;
}

/** "Compare with another walk": the picker, then the two walks played side by side. */
export function CompareButton({ replay }: { readonly replay: WalkReplay }) {
  const { db, dog } = useApp();
  const i18n = useI18n();
  const [picking, setPicking] = useState(false);
  const [other, setOther] = useState<WalkReplay | null>(null);
  const candidates = useMemo(
    () => (picking && dog !== null ? compareCandidates(db, dog.id, replay.walkId) : []),
    [picking, db, dog, replay.walkId],
  );
  if (dog === null) {
    return null;
  }
  return (
    <>
      <Button
        label={i18n.t('twowalks.open')}
        icon="map"
        tone="ghost"
        onPress={() => {
          setPicking(true);
        }}
      />
      <Sheet
        visible={picking && other === null}
        title={i18n.t('twowalks.pick')}
        onClose={() => {
          setPicking(false);
        }}
      >
        <CandidateList
          candidates={candidates.map((c) => ({
            key: c.walkId,
            title: i18n.t('twowalks.walkLine', {
              date: i18n.formatDate(c.startedAt, Date.now()),
              duration: c.durationS === null ? '—' : i18n.formatDuration(c.durationS),
              distance:
                c.distanceM === null || c.distanceM <= 0 ? '—' : i18n.formatDistance(c.distanceM),
            }),
            place: c.placeName,
            samePlace: c.samePlace,
          }))}
          onPick={(id) => {
            setOther(walkReplay(db, id, Date.now()));
          }}
        />
      </Sheet>
      {other === null ? null : (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => {
            setOther(null);
            setPicking(false);
          }}
        >
          <CompareBody
            first={replay}
            second={other}
            onChange={() => {
              setOther(null);
            }}
            onClose={() => {
              setOther(null);
              setPicking(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function CompareBody({
  first,
  second,
  onChange,
  onClose,
}: {
  first: WalkReplay;
  second: WalkReplay;
  onChange: () => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { style: light, failed } = useMapStyle();
  const camera = useRef<CameraRef>(null);
  const [sync, setSync] = useState<CompareSync>('progress');
  const [master, setMaster] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);

  const sideA: CompareSide = useMemo(() => compareSide(first), [first]);
  const sideB: CompareSide = useMemo(() => compareSide(second), [second]);
  const axis = useMemo(
    () => compareAxis(sideA.engine.lengthMs, sideB.engine.lengthMs, sync),
    [sideA, sideB, sync],
  );
  const frameA = useMemo(() => sideA.engine.frameAt(axis.axisA(master)), [sideA, axis, master]);
  const frameB = useMemo(() => sideB.engine.frameAt(axis.axisB(master)), [sideB, axis, master]);
  const scheme = theme.scheme === 'dark' ? 'dark' : 'light';
  const paint = COMPARE_PAINT[scheme];
  const style = useMemo(
    () => (light === null ? null : theme.scheme === 'dark' ? darkenMapStyle(light) : light),
    [light, theme.scheme],
  );
  const lineA = useMemo(() => lineOf(first), [first]);
  const lineB = useMemo(() => lineOf(second), [second]);
  const rows = useMemo(() => compareRows(sideA, sideB, i18n), [sideA, sideB, i18n]);
  const atA: LngLat = [frameA.lon, frameA.lat];
  const atB: LngLat = [frameB.lon, frameB.lat];

  useEffect(() => {
    if (!playing) {
      return;
    }
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const step = (now - last) * speed;
      last = now;
      setMaster((current) => {
        const next = current + step;
        if (next >= axis.lengthMs) {
          setPlaying(false);
          return axis.lengthMs;
        }
        return next;
      });
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [playing, speed, axis.lengthMs]);

  // both walks in view at first: a box around the two routes
  const bounds = useMemo(() => {
    const all = [...lineA, ...lineB];
    const lons = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as const;
  }, [lineA, lineB]);
  useEffect(() => {
    const timer = setTimeout(() => {
      camera.current?.fitBounds([bounds[0], bounds[1], bounds[2], bounds[3]], {
        padding: { top: 40, right: 40, bottom: 40, left: 40 },
        duration: 400,
      });
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [bounds]);

  const changeSync = (next: CompareSync): void => {
    // keep the first walk where it is: the shared axis is re-read from its own place
    setSync(next);
  };

  // the second walk ends before the first on the time axis: a strip under the bar says where
  const bands =
    sync === 'time' && sideB.engine.lengthMs < axis.lengthMs
      ? [
          {
            from: sideB.engine.lengthMs / axis.lengthMs,
            to: 1,
            color: paint.b,
          },
        ]
      : sync === 'time' && sideA.engine.lengthMs < axis.lengthMs
        ? [{ from: sideA.engine.lengthMs / axis.lengthMs, to: 1, color: paint.a }]
        : [];
  const sliderEngine = useMemo(
    () => ({ ...sideA.engine, lengthMs: axis.lengthMs, ticks: [], passes: [], hidden: [] }),
    [sideA, axis.lengthMs],
  );
  const colors = theme.colors;
  const mapHeight = Math.round(height * 0.4);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
        <AppText variant="numBig" style={{ fontSize: 18, flexShrink: 1 }} numberOfLines={1}>
          {i18n.t('twowalks.title')}
        </AppText>
        <Button label={i18n.t('replay.close')} tone="ghost" onPress={onClose} />
      </View>
      <View style={{ height: mapHeight, backgroundColor: colors.map.bg }}>
        {style === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <AppText variant="muted">
              {failed ? i18n.t('map.offline') : i18n.t('map.loading')}
            </AppText>
          </View>
        ) : (
          <MapView style={{ flex: 1 }} mapStyle={style} logo={false} attribution>
            <Camera
              ref={camera}
              initialViewState={{ center: lineA[0] ?? [37.6173, 55.7558], zoom: 15 }}
            />
            {(
              [
                ['a', lineA, paint.a],
                ['b', lineB, paint.b],
              ] as const
            ).map(([id, line, color]) => (
              <GeoJSONSource
                key={id}
                id={`cmp-${id}`}
                data={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: line.length < 2 ? [...line, ...line] : line,
                  },
                }}
              >
                <Layer
                  id={`cmp-${id}-line`}
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': color, 'line-width': 4, 'line-opacity': 0.3 }}
                />
              </GeoJSONSource>
            ))}
            {(
              [
                // the second walk is wider and underneath, the first one thinner on top: where the two
                // routes run together both colours stay in sight
                ['b', second, frameB.wallTs, atB, paint.b, 9],
                ['a', first, frameA.wallTs, atA, paint.a, 4],
              ] as const
            ).map(([id, replay, wallTs, at, color, width]) => (
              <GeoJSONSource
                key={`w${id}`}
                id={`cmp-walked-${id}`}
                data={{
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates: walkedLine(replay, wallTs, at) },
                }}
              >
                <Layer
                  id={`cmp-walked-${id}-line`}
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': color, 'line-width': width }}
                />
              </GeoJSONSource>
            ))}
            <Marker id="cmp-b" lngLat={atB}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: paint.b,
                  borderWidth: 3,
                  borderColor: colors.surface,
                }}
              />
            </Marker>
            <Marker id="cmp-a" lngLat={atA}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: paint.a,
                  borderWidth: 3,
                  borderColor: colors.surface,
                }}
              />
            </Marker>
          </MapView>
        )}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
      >
        <ReplaySlider
          engine={sliderEngine}
          value={axis.lengthMs <= 0 ? 0 : Math.min(1, master / axis.lengthMs)}
          onChange={(value) => {
            setMaster(value * axis.lengthMs);
          }}
          onTick={() => undefined}
          bands={bands}
        />
        <CompareControls
          playing={playing}
          speed={speed}
          sync={sync}
          onPlay={() => {
            if (!playing && master >= axis.lengthMs) {
              setMaster(0);
            }
            setPlaying((p) => !p);
          }}
          onSpeed={setSpeed}
          onSync={changeSync}
          onChange={onChange}
        />
        <CompareTable
          live={liveRows(frameA, frameB, i18n)}
          rows={rows}
          colorA={paint.a}
          colorB={paint.b}
          lead={leadText(frameA, frameB, i18n)}
        />
      </ScrollView>
    </View>
  );
}
