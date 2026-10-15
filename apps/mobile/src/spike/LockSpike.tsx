import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { Proximity, type ProximityEvent } from '../../modules/pawquest-proximity/src';

const UNLOCK_SWIPE_PX = 180;

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour12: false });
}

/**
 * Spike S6: a "pocket mode". While locked a black layer swallows every touch; a swipe up unlocks.
 * The proximity sensor can lock automatically when the phone goes into a pocket.
 */
export function LockSpike(props: { onBack: () => void }) {
  const [locked, setLocked] = useState(false);
  const [autoLock, setAutoLock] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [last, setLast] = useState<ProximityEvent | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [testTaps, setTestTaps] = useState(0);
  const [swallowed, setSwallowed] = useState(0);
  const autoLockRef = useRef(autoLock);
  autoLockRef.current = autoLock;

  useEffect(() => {
    setAvailable(Proximity.isAvailable());
    const started = Proximity.start();
    const subscription = Proximity.onChange((e) => {
      setLast(e);
      setEvents((list) =>
        [
          `${clock(Date.now())} ${e.near ? 'ближе' : 'далеко'} (${String(e.distanceCm)} см)`,
          ...list,
        ].slice(0, 6),
      );
      if (e.near && autoLockRef.current) {
        setLocked(true);
      }
    });
    if (!started) {
      setEvents(['датчика приближения нет']);
    }
    return () => {
      subscription.remove();
      Proximity.stop();
    };
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setSwallowed((n) => n + 1);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -UNLOCK_SWIPE_PX) {
            setLocked(false);
          }
        },
      }),
    [],
  );

  const overlayHandlers = pan.panHandlers;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Pressable onPress={props.onBack} style={styles.chip}>
          <Text style={styles.chipText}>← Назад</Text>
        </Pressable>
        <Text style={styles.title}>Spike S6: карманный режим</Text>
        <Text style={styles.line}>
          {`Датчик приближения: ${available === null ? '…' : available ? 'есть' : 'нет'}` +
            (last === null ? '' : ` · сейчас ${last.near ? 'закрыт' : 'открыт'}`)}
        </Text>
        {events.map((e) => (
          <Text key={e} style={styles.muted}>
            {e}
          </Text>
        ))}
        <Pressable
          onPress={() => {
            setTestTaps((n) => n + 1);
          }}
          style={styles.test}
        >
          <Text style={styles.chipText}>{`Тест-кнопка: нажато ${String(testTaps)}`}</Text>
        </Pressable>
        <Text style={styles.line}>{`Тапов проглочено блокировкой: ${String(swallowed)}`}</Text>
        <Pressable
          onPress={() => {
            setAutoLock((v) => !v);
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>
            {autoLock ? 'Автоблокировка по датчику: ВКЛ' : 'Автоблокировка по датчику: выкл'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setLocked(true);
          }}
          style={styles.chip}
        >
          <Text style={styles.chipText}>🔒 Заблокировать</Text>
        </Pressable>
      </View>
      {locked ? (
        <View style={styles.overlay} {...overlayHandlers}>
          <Text style={styles.overlayText}>Потяни вверх, чтобы разблокировать</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 20, paddingTop: 56, gap: 10 },
  title: { fontSize: 20, fontWeight: '700' },
  line: { fontSize: 15, color: '#223' },
  muted: { fontSize: 13, color: '#667' },
  chip: {
    backgroundColor: '#E3EBE6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipText: { color: '#17201A', fontWeight: '600', fontSize: 15 },
  test: { backgroundColor: '#cfe8dc', borderRadius: 14, padding: 22, alignItems: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 80,
  },
  overlayText: { color: '#333', fontSize: 14 },
});
