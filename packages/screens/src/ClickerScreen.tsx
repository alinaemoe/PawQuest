import type { AttemptResult } from '@pawquest/data';
import { AppText, Button, Icon, useI18n, useTheme } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { percent } from './training';

export interface ClickerScreenProps {
  readonly skillName: string;
  /** "Дистанция 5 м" or null. */
  readonly levelText: string | null;
  /** When the session started: the stopwatch counts from here. */
  readonly startedAt: number;
  readonly successful: number;
  readonly partial: number;
  readonly unsuccessful: number;
  /** Success share (partial counts half) or null before the first attempt. */
  readonly share: number | null;
  readonly onResult: (result: AttemptResult) => void;
  readonly onUndo: () => void;
  readonly onStop: () => void;
}

/** The clicker (spec S11): one tap, one attempt. Big targets, nothing else to look at. */
export function ClickerScreen(props: ClickerScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const insets = useSafeAreaInsets();
  const total = props.successful + props.partial + props.unsuccessful;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const pct = percent(props.share);
  const result = (
    label: string,
    icon: 'check' | 'tilde' | 'x',
    kind: AttemptResult,
    tint: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        props.onResult(kind);
      }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 96,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: tint,
        backgroundColor: pressed ? colors.accentSoft : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Icon name={icon} color={tint} size={30} strokeWidth={2.4} />
      <AppText weight={600}>{label}</AppText>
    </Pressable>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 12,
        paddingHorizontal: 16,
        gap: 14,
      }}
    >
      <View style={{ gap: 2 }}>
        <AppText variant="title" numberOfLines={1}>
          {props.skillName}
        </AppText>
        {props.levelText === null ? null : <AppText variant="muted">{props.levelText}</AppText>}
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <AppText variant="mono" style={{ fontSize: 30, lineHeight: 38, flexShrink: 0 }}>
          {i18n.formatClock((now - props.startedAt) / 1000)}
        </AppText>
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <AppText variant="muted">{i18n.t('clicker.attemptsLabel')}</AppText>
            <AppText variant="mono" weight={700} style={{ fontSize: 28, lineHeight: 34 }}>
              {String(total)}
            </AppText>
          </View>
          <AppText variant="muted">
            {pct === null ? i18n.t('clicker.hint') : i18n.t('sum.share', { pct })}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            [props.successful, 'clicker.success', colors.accent],
            [props.partial, 'clicker.partial', colors.events.ok],
            [props.unsuccessful, 'clicker.fail', colors.events.hard],
          ] as const
        ).map(([count, key, color]) => (
          <View
            key={key}
            style={{
              flex: 1,
              backgroundColor: colors.surface2,
              borderRadius: 14,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <AppText variant="mono" weight={700} style={{ fontSize: 22, lineHeight: 28, color }}>
              {String(count)}
            </AppText>
            <AppText variant="muted" style={{ fontSize: 11 }}>
              {i18n.t(key)}
            </AppText>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.t('clicker.success')}
        onPress={() => {
          props.onResult('successful');
        }}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 180,
          borderRadius: 32,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Icon name="check" color={colors.accentInk} size={64} strokeWidth={2.6} />
        <AppText variant="title" style={{ color: colors.accentInk, fontSize: 20 }}>
          {i18n.t('clicker.success')}
        </AppText>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {result(i18n.t('clicker.partial'), 'tilde', 'partial', colors.events.ok)}
        {result(i18n.t('clicker.fail'), 'x', 'unsuccessful', colors.events.hard)}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={i18n.t('clicker.undo')}
            tone="ghost"
            icon="undo"
            disabled={total === 0}
            onPress={props.onUndo}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={i18n.t('clicker.stop')} tone="ghost" icon="stop" onPress={props.onStop} />
        </View>
      </View>
    </View>
  );
}
