import {
  AppText,
  Button,
  Card,
  EventButton,
  Icon,
  useTheme,
  type EventKind,
} from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

const EVENTS: readonly { kind: EventKind; label: string }[] = [
  { kind: 'dog', label: 'Собака' },
  { kind: 'person', label: 'Человек' },
  { kind: 'child', label: 'Ребёнок' },
  { kind: 'animal', label: 'Животное' },
  { kind: 'ok', label: 'Успех' },
  { kind: 'hard', label: 'Сложно' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(totalSeconds % 60)}`;
}

/** Active Walk (spec S03): status, quick events 3x3, training button, pause and finish. */
export function ActiveWalkScreen() {
  const { colors } = useTheme().theme;
  const [seconds, setSeconds] = useState(1421);
  const [paused, setPaused] = useState(false);
  const [counts, setCounts] = useState<Record<EventKind, number>>({
    dog: 0,
    person: 0,
    child: 0,
    animal: 0,
    ok: 0,
    hard: 0,
    ex: 0,
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (paused) {
      return undefined;
    }
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [paused]);

  useEffect(() => {
    if (toast === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setToast(null);
    }, 2400);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const rows = [EVENTS.slice(0, 3), EVENTS.slice(3, 6)];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, gap: 12 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
        >
          <View>
            <AppText variant="eyebrow">{paused ? 'Пауза' : 'Идёт прогулка'}</AppText>
            <AppText variant="mono" style={{ fontSize: 32, lineHeight: 38 }}>
              {formatClock(seconds)}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <AppText variant="numBig" style={{ fontSize: 22 }}>
              {`${((seconds * 1.3) / 1000).toFixed(2).replace('.', ',')} км`}
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
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: colors.events.animal,
                }}
              />
              <AppText variant="small">GPS хороший</AppText>
            </View>
          </View>
        </View>

        <View
          style={{
            height: 120,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.map.bg,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 30,
              top: 20,
              width: 150,
              height: 80,
              borderRadius: 60,
              backgroundColor: colors.map.green,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: -20,
              bottom: -20,
              width: 120,
              height: 70,
              borderRadius: 40,
              backgroundColor: colors.map.water,
            }}
          />
          <AppText variant="muted">карта (позже: MapLibre)</AppText>
        </View>

        <Button
          label="Тренировка"
          icon="target"
          size="lg"
          onPress={() => {
            setToast('Откроется выбор навыка');
          }}
        />

        <View style={{ gap: 8 }}>
          {rows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              {row.map((e) => (
                <EventButton
                  key={e.kind}
                  kind={e.kind}
                  label={e.label}
                  count={counts[e.kind]}
                  onPress={() => {
                    setCounts((c) => ({ ...c, [e.kind]: c[e.kind] + 1 }));
                    setToast(`${e.label} · записано`);
                  }}
                  onLongPress={() => {
                    setToast(`${e.label}: детали (шторка)`);
                  }}
                />
              ))}
            </View>
          ))}
        </View>
        <AppText variant="muted" style={{ textAlign: 'center', fontSize: 12 }}>
          Тап: записать · удержание: детали
        </AppText>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={paused ? 'Продолжить' : 'Пауза'}
              tone="ghost"
              icon={paused ? 'play' : 'pause'}
              onPress={() => {
                setPaused((p) => !p);
              }}
            />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button
              label="Завершить"
              tone="ghost"
              icon="stop"
              onPress={() => {
                setToast('Удерживайте, чтобы завершить');
              }}
            />
          </View>
        </View>

        <Card variant="stripe">
          <AppText variant="eyebrow">Подсказка</AppText>
          <AppText variant="small">
            Кнопки события ≥ 68 dp, главные действия 72 dp (G-01). Цвет события дублируется формой.
          </AppText>
        </Card>
        <View style={{ height: 8 }}>
          <Icon name="paw" color={colors.muted} size={1} />
        </View>
      </ScrollView>

      {toast === null ? null : (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 20,
            backgroundColor: colors.ink,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <AppText style={{ color: colors.bg }}>{toast}</AppText>
        </View>
      )}
    </View>
  );
}
