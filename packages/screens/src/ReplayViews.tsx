import { AppText, Button, Card, Chip, useI18n, useTheme } from '@pawquest/rn-ui';
import { useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';

import type { ReplayAxisMode, ReplayEngine, ReplayTick } from './replayEngine';
import type { ReplayReadout, SpeedSummaryModel } from './replayModel';

export const REPLAY_SPEEDS = [1, 5, 20, 60] as const;

export interface ReplaySliderProps {
  readonly engine: ReplayEngine;
  /** Where we are on the axis, 0..1. */
  readonly value: number;
  readonly onChange: (fraction: number) => void;
  readonly onTick: (tick: ReplayTick) => void;
}

const SLIDER_HEIGHT = 44;

/**
 * The time slider (S07-Sc): drag anywhere, a tick for each event and photo that jumps to it, the
 * stretch of a saved route in the accent colour, pauses hatched on the real-time axis.
 */
export function ReplaySlider({ engine, value, onChange, onTick }: ReplaySliderProps) {
  const { colors } = useTheme().theme;
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const emit = useRef(onChange);
  emit.current = onChange;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        emit.current(Math.min(1, Math.max(0, e.nativeEvent.locationX / widthRef.current)));
      },
      onPanResponderMove: (e) => {
        emit.current(Math.min(1, Math.max(0, e.nativeEvent.locationX / widthRef.current)));
      },
    }),
  ).current;
  const x = (fraction: number): number => fraction * width;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onLayout={(e) => {
        widthRef.current = Math.max(1, e.nativeEvent.layout.width);
        setWidth(widthRef.current);
      }}
      style={{ height: SLIDER_HEIGHT, justifyContent: 'center' }}
      {...pan.panHandlers}
    >
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2 }} />
      {engine.passes.map((p) => (
        <View
          key={`${String(p.from)}-${p.pass.routeId}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: x(p.from),
            width: Math.max(3, x(p.to - p.from)),
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.accentSoft,
          }}
        />
      ))}
      {engine.hidden.map((h) => (
        <View
          key={`h${String(h.from)}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: x(h.from),
            width: Math.max(2, x(h.to - h.from)),
            height: 8,
            backgroundColor: colors.line,
            opacity: 0.8,
          }}
        />
      ))}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          width: x(value),
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.accent,
        }}
      />
      {engine.ticks.map((tick) => (
        <Pressable
          key={tick.key}
          accessibilityRole="button"
          accessibilityLabel={tick.kind}
          hitSlop={8}
          onPress={() => {
            onTick(tick);
          }}
          style={{
            position: 'absolute',
            left: x(tick.at) - 5,
            top: tick.kind === 'event' ? 2 : SLIDER_HEIGHT - 16,
            width: 10,
            height: 14,
            borderRadius: tick.kind === 'event' ? 2 : 7,
            backgroundColor: tick.kind === 'event' ? colors.ink : colors.accent,
            borderWidth: 1,
            borderColor: colors.surface,
          }}
        />
      ))}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: x(value) - 8,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: colors.accent,
          borderWidth: 2,
          borderColor: colors.surface,
        }}
      />
    </View>
  );
}

export interface ReplayControlsProps {
  readonly playing: boolean;
  readonly speed: number;
  readonly mode: ReplayAxisMode;
  readonly hasEvents: boolean;
  readonly onPlay: () => void;
  readonly onSkip: (seconds: number) => void;
  readonly onEvent: (direction: 'next' | 'previous') => void;
  readonly onSpeed: (speed: number) => void;
  readonly onMode: (mode: ReplayAxisMode) => void;
}

/** Play, jumps, speed and the choice of axis (S07-Pl, S07-Fl). */
export function ReplayControls(props: ReplayControlsProps) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Chip
          label="⏮"
          onPress={() => {
            props.onEvent('previous');
          }}
        />
        <Chip
          label="−10"
          onPress={() => {
            props.onSkip(-10);
          }}
        />
        <View style={{ flex: 1 }}>
          <Button
            label={props.playing ? i18n.t('replay.pause') : i18n.t('replay.play')}
            onPress={props.onPlay}
          />
        </View>
        <Chip
          label="+10"
          onPress={() => {
            props.onSkip(10);
          }}
        />
        <Chip
          label="⏭"
          onPress={() => {
            props.onEvent('next');
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {REPLAY_SPEEDS.map((s) => (
          <Chip
            key={s}
            size="sm"
            label={`${String(s)}×`}
            selected={s === props.speed}
            onPress={() => {
              props.onSpeed(s);
            }}
          />
        ))}
        <Chip
          size="sm"
          label={i18n.t('replay.axis.moving')}
          selected={props.mode === 'moving'}
          onPress={() => {
            props.onMode('moving');
          }}
        />
        <Chip
          size="sm"
          label={i18n.t('replay.axis.real')}
          selected={props.mode === 'real'}
          onPress={() => {
            props.onMode('real');
          }}
        />
      </View>
    </View>
  );
}

/** The line under the slider: time, distance, speed now, events so far, and the saved route. */
export function ReplayReadoutView({ readout }: { readonly readout: ReplayReadout }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText weight={600}>{readout.clock}</AppText>
        <AppText>{readout.distance}</AppText>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="muted">{readout.speed}</AppText>
        <AppText variant="muted">{readout.events}</AppText>
      </View>
      {readout.pass === null ? null : <AppText variant="muted">{readout.pass}</AppText>}
    </View>
  );
}

export interface SpeedSummaryViewProps {
  readonly model: SpeedSummaryModel;
  /** Where the slider is, 0..1, for the cursor of the profile. */
  readonly cursor: number;
  readonly onSeek: (fraction: number) => void;
}

const PROFILE_HEIGHT = 56;

/** Time in each speed zone and the profile of the pace over the walk (S07-Z, S07-Pr). */
export function SpeedSummaryView({ model, cursor, onSeek }: SpeedSummaryViewProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const [width, setWidth] = useState(1);
  return (
    <Card variant="flat">
      <View style={{ gap: 10 }}>
        <AppText variant="eyebrow">{i18n.t('replay.speed.title')}</AppText>
        {model.zones.map((row) => (
          <View key={row.zone} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText>{row.label}</AppText>
              <AppText variant="muted">{row.value}</AppText>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2 }}>
              <View
                style={{
                  width: `${Math.max(2, Math.round(row.share * 100))}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('replay.speed.profile')}
          onLayout={(e) => {
            setWidth(Math.max(1, e.nativeEvent.layout.width));
          }}
          onPress={(e) => {
            onSeek(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
          }}
          style={{ height: PROFILE_HEIGHT, justifyContent: 'flex-end' }}
        >
          {model.profile.map((w, i) => (
            <View
              key={String(i)}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: w.at * width,
                bottom: 0,
                width: Math.max(2, width / Math.max(1, model.profile.length) - 1),
                height: Math.max(2, w.level * PROFILE_HEIGHT),
                backgroundColor: colors.accentSoft,
              }}
            />
          ))}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cursor * width,
              bottom: 0,
              width: 2,
              height: PROFILE_HEIGHT,
              backgroundColor: colors.ink,
            }}
          />
        </Pressable>
        <AppText variant="muted">
          {model.pattern}
          {model.fastStart === null ? '' : ` · ${model.fastStart}`}
        </AppText>
      </View>
    </Card>
  );
}
