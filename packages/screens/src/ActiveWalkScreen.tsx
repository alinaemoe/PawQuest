import {
  AppText,
  Button,
  EventButton,
  Icon,
  Screen,
  useI18n,
  useTheme,
  type EventKind,
} from '@pawquest/rn-ui';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useEffect, useState } from 'react';

export type GpsStatus = 'good' | 'weak' | 'none' | 'off';

export interface WalkEventButton {
  readonly id: string;
  readonly label: string;
  readonly kind: EventKind;
  readonly count: number;
}

export interface ActiveWalkScreenProps {
  /** The route map (an app-level component: MapLibre is native), shown under the clock. */
  readonly map?: ReactNode;
  /** When the walk started, for the clock. */
  readonly startedAt: number;
  /** Time spent paused so far, subtracted from the clock. */
  readonly pausedMs: number;
  readonly paused: boolean;
  readonly distanceM: number;
  readonly gps: GpsStatus;
  readonly events: readonly WalkEventButton[];
  /** Set while the recovery timer runs (a hard moment): "Реакция 0:24 [Успокоилась]". */
  readonly recovery: { readonly since: number } | null;
  readonly onEvent: (id: string) => void;
  readonly onCalm: () => void;
  readonly onTraining: () => void;
  readonly onTogglePause: () => void;
  readonly onFinish: () => void;
  /** A short tap on "Finish" only explains how to finish. */
  readonly onFinishHint: () => void;
}

const GPS_KEYS = {
  good: 'active.gpsGood',
  weak: 'active.gpsWeak',
  none: 'active.gpsNone',
  off: 'active.gpsOff',
} as const;

/**
 * Active Walk (spec S03): the clock, the big event buttons and pause/finish. Targets are 72 dp or
 * more (G-01), nothing blocks the screen (G-04); finishing needs a one second hold.
 */
export function ActiveWalkScreen(props: ActiveWalkScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const elapsedS = Math.max(0, (now - props.startedAt - props.pausedMs) / 1000);
  const gpsColor =
    props.gps === 'good'
      ? colors.events.animal
      : props.gps === 'weak'
        ? colors.events.ok
        : colors.muted;
  const rows: (readonly WalkEventButton[])[] = [];
  for (let i = 0; i < props.events.length; i += 3) {
    rows.push(props.events.slice(i, i + 3));
  }

  return (
    <Screen>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <View>
          <AppText variant="eyebrow">
            {props.paused ? i18n.t('active.paused') : i18n.t('active.running')}
          </AppText>
          <AppText variant="mono" style={{ fontSize: 34, lineHeight: 40 }}>
            {i18n.formatClock(elapsedS)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <AppText variant="numBig" style={{ fontSize: 22 }}>
            {i18n.formatDistance(props.distanceM)}
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.surface2,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: gpsColor }} />
            <AppText variant="small">{i18n.t(GPS_KEYS[props.gps])}</AppText>
          </View>
        </View>
      </View>

      {props.map}

      {props.recovery === null ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.accentSoft,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <AppText>
            {i18n.t('active.reaction')}{' '}
            <AppText variant="mono" weight={600}>
              {i18n.formatClock((now - props.recovery.since) / 1000).slice(3)}
            </AppText>
          </AppText>
          <Button label={i18n.t('active.calm')} tone="ghost" onPress={props.onCalm} />
        </View>
      )}

      <Button
        label={i18n.t('active.training')}
        icon="target"
        size="lg"
        onPress={props.onTraining}
      />

      <View style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={String(index)} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((event) => (
              <EventButton
                key={event.id}
                kind={event.kind}
                label={event.label}
                count={event.count}
                onPress={() => {
                  props.onEvent(event.id);
                }}
              />
            ))}
            {row.length < 3
              ? Array.from({ length: 3 - row.length }, (_, i) => (
                  <View key={`pad-${String(i)}`} style={{ flex: 1 }} />
                ))
              : null}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={props.paused ? i18n.t('active.resume') : i18n.t('active.pause')}
            tone="ghost"
            icon={props.paused ? 'play' : 'pause'}
            onPress={props.onTogglePause}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('active.finish')}
          accessibilityHint={i18n.t('active.finishHint')}
          delayLongPress={1000}
          onPress={props.onFinishHint}
          onLongPress={props.onFinish}
          style={({ pressed }) => ({
            flex: 1.3,
            minHeight: 48,
            borderRadius: 16,
            backgroundColor: pressed ? colors.accent : colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
          })}
        >
          <Icon name="stop" color={colors.ink} size={22} />
          <AppText weight={600} style={{ fontSize: 16 }}>
            {i18n.t('active.finish')}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
