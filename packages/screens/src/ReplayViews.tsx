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
  /** Stays in saved places as coloured strips under the bar. */
  readonly bands?: readonly {
    readonly from: number;
    readonly to: number;
    readonly color: string;
  }[];
}

const SLIDER_HEIGHT = 44;

/**
 * The time slider (S07-Sc): drag anywhere, a tick for each event and photo that jumps to it, the
 * stretch of a saved route in the accent colour, pauses hatched on the real-time axis.
 */
export function ReplaySlider({ engine, value, onChange, onTick, bands = [] }: ReplaySliderProps) {
  const { colors } = useTheme().theme;
  const [width, setWidth] = useState(1);
  const box = useRef<View>(null);
  // the position of the slider on the screen; a touch is measured from it, not from the part of
  // the slider that happens to be under the finger (that made the handle jump back)
  const frame = useRef({ left: 0, width: 1 });
  const live = useRef({ onChange, onTick, ticks: engine.ticks });
  live.current = { onChange, onTick, ticks: engine.ticks };
  const fractionOf = (pageX: number): number =>
    Math.min(1, Math.max(0, (pageX - frame.current.left) / frame.current.width));
  const measure = (): void => {
    box.current?.measureInWindow((left, _top, measuredWidth) => {
      frame.current = { left, width: Math.max(1, measuredWidth) };
    });
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        live.current.onChange(fractionOf(e.nativeEvent.pageX));
      },
      onPanResponderMove: (e) => {
        live.current.onChange(fractionOf(e.nativeEvent.pageX));
      },
      onPanResponderRelease: (e, gesture) => {
        // a tap near a mark of an event or a photo jumps to it
        if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) {
          return;
        }
        const at = fractionOf(e.nativeEvent.pageX);
        const reach = 16 / frame.current.width;
        let best: ReplayTick | undefined;
        for (const tick of live.current.ticks) {
          if (
            Math.abs(tick.at - at) <= reach &&
            (best === undefined || Math.abs(tick.at - at) < Math.abs(best.at - at))
          ) {
            best = tick;
          }
        }
        if (best !== undefined) {
          live.current.onTick(best);
        }
      },
    }),
  ).current;
  const x = (fraction: number): number => fraction * width;
  return (
    <View
      ref={box}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onLayout={(e) => {
        setWidth(Math.max(1, e.nativeEvent.layout.width));
        measure();
      }}
      style={{ height: SLIDER_HEIGHT, justifyContent: 'center' }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={{ height: SLIDER_HEIGHT, justifyContent: 'center' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2 }} />
        {engine.passes.map((p) => (
          <View
            key={`${String(p.from)}-${p.pass.routeId}`}
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
        {bands.map((b, i) => (
          <View
            key={`band-${String(i)}`}
            style={{
              position: 'absolute',
              left: x(b.from),
              width: Math.max(3, x(b.to - b.from)),
              top: SLIDER_HEIGHT / 2 + 8,
              height: 4,
              borderRadius: 2,
              backgroundColor: b.color,
            }}
          />
        ))}
        {engine.hidden.map((h) => (
          <View
            key={`h${String(h.from)}`}
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
          <View
            key={tick.key}
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
          icon="skipBack"
          label={i18n.t('replay.prevEvent')}
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
            icon={props.playing ? 'pause' : 'play'}
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
          icon="skipForward"
          label={i18n.t('replay.nextEvent')}
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
      {readout.place === null ? null : <AppText weight={600}>{readout.place}</AppText>}
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

export interface ReplayPaintBarProps {
  readonly mode: 'plain' | 'speed' | 'places';
  readonly onMode: (mode: 'plain' | 'speed' | 'places') => void;
  /** What the colours on the route mean: a dot, a word and the share of the walk. */
  readonly legend: readonly {
    readonly key: string;
    readonly color: string;
    readonly label: string;
    readonly share: string;
  }[];
}

/** How the route is painted (plain, by speed, by place) and what each colour is. */
export function ReplayPaintBar({ mode, onMode, legend }: ReplayPaintBarProps) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip
          size="sm"
          lead="map"
          label={i18n.t('replay.paint.plain')}
          selected={mode === 'plain'}
          onPress={() => {
            onMode('plain');
          }}
        />
        <Chip
          size="sm"
          lead="clock"
          label={i18n.t('replay.paint.speed')}
          selected={mode === 'speed'}
          onPress={() => {
            onMode('speed');
          }}
        />
        <Chip
          size="sm"
          lead="pin"
          label={i18n.t('replay.paint.places')}
          selected={mode === 'places'}
          onPress={() => {
            onMode('places');
          }}
        />
      </View>
      {mode === 'plain' ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {legend.map((item) => (
            <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color }}
              />
              <AppText style={{ fontSize: 12 }}>{item.label}</AppText>
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {item.share}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export interface ReplayUsualCardProps {
  /** Only what departs from the usual, at most four; empty means "all as usual". */
  readonly lines: readonly string[];
  readonly caption: string;
}

/** "How it was against the usual" under the map of a replay: facts, no grade (A-26). */
export function ReplayUsualCard({ lines, caption }: ReplayUsualCardProps) {
  const i18n = useI18n();
  return (
    <Card variant="flat">
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('replay.usual.title')}</AppText>
        {lines.length === 0 ? (
          <AppText>{i18n.t('replay.usual.allSame')}</AppText>
        ) : (
          lines.slice(0, 4).map((text) => <AppText key={text}>{text}</AppText>)
        )}
        <AppText variant="muted">{caption}</AppText>
      </View>
    </Card>
  );
}
