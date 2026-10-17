import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { positionAt, simplifyTrack } from '@pawquest/core';
import {
  getWalk,
  listEventTypes,
  trimWalkEndUndoable,
  walkReplay,
  type WalkReplay,
} from '@pawquest/data';
import { AppText, Button, Chip, useI18n, useTheme, type EventKind } from '@pawquest/rn-ui';
import {
  eventTypeLabel,
  makeReplayEngine,
  PhotoStrip,
  PhotoViewer,
  replayReadout,
  ReplayControls,
  ReplayReadoutView,
  ReplaySlider,
  speedSummary,
  SpeedSummaryView,
  type ReplayAxisMode,
  type ReplayTick,
} from '@pawquest/screens';
import { darkenMapStyle } from '@pawquest/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from './AppContext';
import { useMapStyle } from './useMapStyle';

const TICK_MS = 100;
const PHOTO_FLASH_MS = 4000;
const FOLLOW_EVERY_MS = 700;

/** Opens the replay of a GPS walk; nothing is drawn for a walk with no track. */
export function ReplayButton({ walkId }: { readonly walkId: string }) {
  const { db } = useApp();
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const points = useMemo(
    () =>
      Number(
        db.all('SELECT COUNT(*) AS n FROM track_point WHERE walk_id = ? AND excluded = 0', [
          walkId,
        ])[0]?.['n'] ?? 0,
      ),
    [db, walkId],
  );
  if (points < 2) {
    return null;
  }
  return (
    <>
      <Button
        label={i18n.t('replay.open')}
        icon="play"
        tone="ghost"
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <ReplayModal
          walkId={walkId}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ReplayModal({ walkId, onClose }: { walkId: string; onClose: () => void }) {
  const { db, bump } = useApp();
  const [rev, setRev] = useState(0);
  const replay = useMemo(() => walkReplay(db, walkId, Date.now()), [db, walkId, rev]);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {replay === null ? (
        <ReplayEmpty onClose={onClose} />
      ) : (
        <ReplayBody
          replay={replay}
          onClose={onClose}
          onChanged={() => {
            setRev((r) => r + 1);
            bump();
          }}
        />
      )}
    </Modal>
  );
}

function ReplayEmpty({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 24, gap: 16 }}>
      <AppText variant="muted">{i18n.t('map.offline')}</AppText>
      <Button label={i18n.t('replay.close')} onPress={onClose} />
    </View>
  );
}

function ReplayBody({
  replay,
  onClose,
  onChanged,
}: {
  replay: WalkReplay;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { db, ctx } = useApp();
  const [undo, setUndo] = useState<{ time: number; run: () => void } | null>(null);
  const i18n = useI18n();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { style: light, failed } = useMapStyle();
  const camera = useRef<CameraRef>(null);

  const [mode, setMode] = useState<ReplayAxisMode>('moving');
  const [axisMs, setAxisMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [follow, setFollow] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const engine = useMemo(() => makeReplayEngine(replay, mode), [replay, mode]);
  const frame = useMemo(() => engine.frameAt(axisMs), [engine, axisMs]);
  const fraction = engine.lengthMs <= 0 ? 0 : Math.min(1, axisMs / engine.lengthMs);

  const types = useMemo(() => new Map(listEventTypes(db, true).map((t) => [t.id, t])), [db]);
  const style = useMemo(
    () => (light === null ? null : theme.scheme === 'dark' ? darkenMapStyle(light) : light),
    [light, theme.scheme],
  );

  // the thinned track, with the time of each kept point, so the walked part can follow the marker
  const kept = useMemo(
    () => simplifyTrack(replay.points, { epsilonM: 2 }).map((i) => replay.points[i]),
    [replay],
  );
  const full = useMemo(
    () => kept.flatMap((p) => (p === undefined ? [] : [[p.lon, p.lat] as [number, number]])),
    [kept],
  );
  const walked = useMemo(() => {
    const done = kept.flatMap((p) =>
      p !== undefined && p.ts <= frame.wallTs ? [[p.lon, p.lat] as [number, number]] : [],
    );
    return [...done, [frame.lon, frame.lat] as [number, number]];
  }, [kept, frame.wallTs, frame.lon, frame.lat]);
  const passLines = useMemo(
    () =>
      replay.passes.map((pass) =>
        replay.points
          .filter((p) => p.ts >= pass.fromTs && p.ts <= pass.toTs)
          .map((p): [number, number] => [p.lon, p.lat]),
      ),
    [replay],
  );
  const eventMarks = useMemo(
    () =>
      replay.events.flatMap((e) => {
        const at = positionAt(replay.points, e.ts, { pausedRanges: replay.paused });
        return at === null ? [] : [{ ...e, lngLat: [at.lon, at.lat] as [number, number] }];
      }),
    [replay],
  );
  const photoMarks = useMemo(
    () =>
      replay.photos.flatMap((p) => {
        const at = positionAt(replay.points, p.takenAt, { pausedRanges: replay.paused });
        return at === null ? [] : [{ ...p, lngLat: [at.lon, at.lat] as [number, number] }];
      }),
    [replay],
  );

  // playing: the axis moves by the real time passed times the speed
  useEffect(() => {
    if (!playing) {
      return;
    }
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const step = (now - last) * speed;
      last = now;
      setAxisMs((current) => {
        const next = current + step;
        if (next >= engine.lengthMs) {
          setPlaying(false);
          return engine.lengthMs;
        }
        return next;
      });
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [playing, speed, engine.lengthMs]);

  // the camera follows the marker: every so often while playing, at once after a jump
  const position = useRef<[number, number]>([frame.lon, frame.lat]);
  position.current = [frame.lon, frame.lat];
  useEffect(() => {
    if (!follow) {
      return;
    }
    const timer = setInterval(() => {
      camera.current?.easeTo({ center: position.current, duration: FOLLOW_EVERY_MS });
    }, FOLLOW_EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [follow]);
  useEffect(() => {
    if (follow && !playing) {
      camera.current?.easeTo({ center: [frame.lon, frame.lat], duration: 300 });
    }
  }, [follow, playing, frame.lon, frame.lat]);

  const seekWall = (ts: number): void => {
    setAxisMs(engine.axisOf(ts));
  };
  const seekFraction = (value: number): void => {
    setFocus(null);
    setAxisMs(value * engine.lengthMs);
  };
  const onTick = (tick: ReplayTick): void => {
    seekWall(tick.ts);
    if (tick.kind === 'photo') {
      const index = replay.photos.findIndex((p) => p.id === tick.key);
      setViewer(index < 0 ? null : index);
      setFocus(null);
    } else {
      const event = replay.events.find((e) => e.id === tick.key);
      setFocus(
        event === undefined
          ? null
          : `${eventTypeLabel(types.get(event.typeId), event.typeId, i18n)} · ${i18n.formatTime(event.ts)}`,
      );
    }
  };
  const changeMode = (next: ReplayAxisMode): void => {
    const wall = frame.wallTs;
    setMode(next);
    setAxisMs(makeReplayEngine(replay, next).axisOf(wall));
  };

  const readout = replayReadout(frame, axisMs, engine.lengthMs, replay.events.length, i18n);
  const summary = useMemo(
    () =>
      replay.profile === null
        ? null
        : speedSummary(replay.profile, replay.startTs, replay.endTs, i18n),
    [replay, i18n],
  );
  const fractionOfWall = (ts: number): number =>
    Math.min(1, Math.max(0, (ts - replay.startTs) / Math.max(1, replay.endTs - replay.startTs)));

  const mapHeight = Math.round(height * 0.38);
  const colors = theme.colors;
  const first = full[0];

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
          {i18n.t('replay.title')}
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
              initialViewState={{
                center: first ?? [37.6173, 55.7558],
                zoom: 16,
              }}
            />
            <GeoJSONSource
              id="replay-full"
              data={{
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: full },
              }}
            >
              <Layer
                id="replay-full-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': colors.line, 'line-width': 4 }}
              />
            </GeoJSONSource>
            {passLines.map((coordinates, i) => (
              <GeoJSONSource
                key={`pass-${String(i)}`}
                id={`replay-pass-${String(i)}`}
                data={{
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates },
                }}
              >
                <Layer
                  id={`replay-pass-line-${String(i)}`}
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': colors.events.ok, 'line-width': 8, 'line-opacity': 0.6 }}
                />
              </GeoJSONSource>
            ))}
            <GeoJSONSource
              id="replay-walked"
              data={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: walked.length < 2 ? [...walked, ...walked] : walked,
                },
              }}
            >
              <Layer
                id="replay-walked-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': colors.accent, 'line-width': 5 }}
              />
            </GeoJSONSource>
            {eventMarks.map((m) => {
              const color = types.get(m.typeId)?.color ?? 'ex';
              const kind = (color in colors.events ? color : 'ex') as EventKind;
              return (
                <Marker key={m.id} id={`ev-${m.id}`} lngLat={m.lngLat}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.events[kind],
                      borderWidth: 2,
                      borderColor: '#fff',
                    }}
                  />
                </Marker>
              );
            })}
            {photoMarks.map((m) => {
              const flashing =
                frame.wallTs >= m.takenAt && frame.wallTs <= m.takenAt + PHOTO_FLASH_MS * speed;
              return (
                <Marker key={m.id} id={`ph-${m.id}`} lngLat={m.lngLat}>
                  <View
                    style={{
                      width: flashing ? 26 : 14,
                      height: flashing ? 26 : 14,
                      borderRadius: 13,
                      backgroundColor: colors.accent,
                      borderWidth: 2,
                      borderColor: '#fff',
                    }}
                  />
                </Marker>
              );
            })}
            <Marker id="replay-dog" lngLat={[frame.lon, frame.lat]}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.ink,
                  borderWidth: 3,
                  borderColor: '#fff',
                }}
              />
            </Marker>
          </MapView>
        )}
        <View style={{ position: 'absolute', right: 8, bottom: 8 }}>
          <Chip
            size="sm"
            label={follow ? i18n.t('replay.follow') : i18n.t('replay.overview')}
            selected={follow}
            onPress={() => {
              setFollow((f) => !f);
            }}
          />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
      >
        <ReplayReadoutView readout={readout} />
        {focus === null ? null : <AppText weight={600}>{focus}</AppText>}
        <ReplaySlider engine={engine} value={fraction} onChange={seekFraction} onTick={onTick} />
        <ReplayControls
          playing={playing}
          speed={speed}
          mode={mode}
          hasEvents={replay.events.length > 0}
          onPlay={() => {
            if (!playing && axisMs >= engine.lengthMs) {
              setAxisMs(0);
            }
            setPlaying((p) => !p);
          }}
          onSkip={(seconds) => {
            setAxisMs((a) => Math.min(engine.lengthMs, Math.max(0, a + seconds * 1000)));
          }}
          onEvent={(direction) => {
            const target =
              direction === 'next' ? engine.nextEventMs(axisMs) : engine.previousEventMs(axisMs);
            if (target !== null) {
              setAxisMs(target);
            }
          }}
          onSpeed={setSpeed}
          onMode={changeMode}
        />
        {undo === null ? (
          getWalk(db, replay.walkId)?.status === 'completed' &&
          frame.wallTs < replay.endTs - 1000 ? (
            <Button
              label={i18n.t('replay.finishHere')}
              tone="ghost"
              onPress={() => {
                try {
                  const done = trimWalkEndUndoable(db, ctx, replay.walkId, frame.wallTs);
                  setUndo({ time: frame.wallTs, run: done.undo });
                  onChanged();
                } catch {
                  // the moment cannot be an end (outside the walk): nothing is cut
                }
              }}
            />
          ) : null
        ) : (
          <View style={{ gap: 6 }}>
            <AppText>{i18n.t('replay.finishedHere', { time: i18n.formatTime(undo.time) })}</AppText>
            <Button
              label={i18n.t('replay.undo')}
              tone="ghost"
              onPress={() => {
                undo.run();
                setUndo(null);
                onChanged();
              }}
            />
          </View>
        )}
        <PhotoStrip
          photos={replay.photos}
          onOpen={(index) => {
            const photo = replay.photos[index];
            if (photo !== undefined) {
              seekWall(photo.takenAt);
            }
            setViewer(index);
          }}
        />
        {summary === null ? null : (
          <>
            <SpeedSummaryView
              model={summary}
              cursor={fractionOfWall(frame.wallTs)}
              onSeek={(value) => {
                seekWall(replay.startTs + value * (replay.endTs - replay.startTs));
              }}
            />
            <AppText variant="muted">{i18n.t('replay.speed.note')}</AppText>
          </>
        )}
      </ScrollView>
      <PhotoViewer
        photos={replay.photos}
        openAt={viewer}
        canRemove={false}
        onRemove={() => undefined}
        onClose={() => {
          setViewer(null);
        }}
      />
    </View>
  );
}
