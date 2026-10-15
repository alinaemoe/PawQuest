import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  clearNotifEvents,
  hideWalkNotification,
  readNotifEvents,
  showWalkNotification,
  type NotifEvent,
} from './notif';

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour12: false });
}

/** Spike S5 screen: post the notification, then press its buttons from the shade or lock screen. */
export function NotifSpike(props: { onBack: () => void }) {
  const [message, setMessage] = useState('Нажми «Показать», затем отметь событие из шторки.');
  const [events, setEvents] = useState<NotifEvent[]>([]);

  const refresh = useCallback(() => {
    setEvents(readNotifEvents());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

  return (
    <View style={styles.root}>
      <Pressable onPress={props.onBack} style={styles.chip}>
        <Text style={styles.chipText}>← Назад</Text>
      </Pressable>
      <Text style={styles.title}>Spike S5: уведомление с кнопками</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable
        onPress={() => {
          void showWalkNotification().then(setMessage);
        }}
        style={styles.chip}
      >
        <Text style={styles.chipText}>Показать уведомление</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void hideWalkNotification().then(() => {
            setMessage('Уведомление убрано');
          });
        }}
        style={styles.chip}
      >
        <Text style={styles.chipText}>Убрать уведомление</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          clearNotifEvents();
          refresh();
        }}
        style={styles.chip}
      >
        <Text style={styles.chipText}>Очистить журнал</Text>
      </Pressable>
      <Text style={styles.title}>{`Записано событий: ${String(events.length)}`}</Text>
      {events.slice(-8).map((e) => (
        <Text key={e.at} style={styles.line}>
          {`${clock(e.at)} · ${e.action} · приложение: ${e.appState}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, paddingTop: 56, gap: 10, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  muted: { color: '#667', fontSize: 14 },
  line: { fontSize: 14, color: '#223' },
  chip: {
    backgroundColor: '#E3EBE6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipText: { color: '#17201A', fontWeight: '600', fontSize: 15 },
});
