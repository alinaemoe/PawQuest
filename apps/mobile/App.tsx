import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { buildReport, type SpikeReport } from './src/spike/analyze';
import { LockSpike } from './src/spike/LockSpike';
import { MapSpike } from './src/spike/MapSpike';
import { NotifSpike } from './src/spike/NotifSpike';
import { ReplaySpike } from './src/spike/ReplaySpike';
import { runDbCheck, type DbCheckResult } from './src/spike/dbCheck';
import { runCoreSelfCheck, type SelfCheckItem } from './src/spike/selfCheck';
import { clearLog, readLog, startRecording, stopRecording } from './src/spike/gpsTask';

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour12: false });
}

function fmtDuration(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function Button(props: { label: string; onPress: () => void; tone?: 'primary' | 'plain' }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[styles.button, props.tone === 'plain' && styles.buttonPlain]}
    >
      <Text style={[styles.buttonText, props.tone === 'plain' && styles.buttonTextPlain]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text style={styles.rowValue}>{props.value}</Text>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'map' | 'replay' | 'lock' | 'notif'>('home');
  const goHome = useCallback(() => {
    setScreen('home');
  }, []);
  const [message, setMessage] = useState('Нажми «Начать запись», затем погаси экран и пройдись.');
  const [report, setReport] = useState<SpikeReport | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [markers, setMarkers] = useState<string[]>([]);
  const [keepAwake, setKeepAwake] = useState(false);
  const [selfCheck] = useState<SelfCheckItem[]>(() => runCoreSelfCheck());
  const [dbResult, setDbResult] = useState<DbCheckResult | null>(null);
  const [dbBusy, setDbBusy] = useState<string | null>(null);

  const runDb = useCallback((points: number) => {
    setDbBusy(points === 0 ? 'Проверяю базу…' : `Пишу ${String(points)} точек…`);
    setDbResult(null);
    // let the "busy" text paint before the synchronous work blocks the JS thread
    setTimeout(() => {
      try {
        setDbResult(runDbCheck(points));
      } catch (error) {
        setDbResult({
          steps: [
            {
              name: 'сбой',
              ok: false,
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
          bench: null,
        });
      }
      setDbBusy(null);
    }, 50);
  }, []);

  const refresh = useCallback(() => {
    const log = readLog();
    setReport(log.fixes.length > 0 ? buildReport(log.fixes) : null);
    const last = log.fixes.reduce<number | null>(
      (m, f) => (m === null || f.ts > m ? f.ts : m),
      null,
    );
    setLastFixAt(last);
    setMarkers(log.markers.map((m) => `${m.marker} ${fmtClock(m.at)}`));
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

  if (screen === 'map') {
    return <MapSpike onBack={goHome} />;
  }
  if (screen === 'replay') {
    return <ReplaySpike onBack={goHome} />;
  }
  if (screen === 'lock') {
    return <LockSpike onBack={goHome} />;
  }
  if (screen === 'notif') {
    return <NotifSpike onBack={goHome} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {keepAwake ? <KeepScreenOn /> : null}
      <Text style={styles.title}>Spike S1: фоновый GPS</Text>
      <Text style={styles.muted}>{message}</Text>

      <View style={styles.buttons}>
        <Button
          label="Начать запись"
          onPress={() => {
            void startRecording().then((m) => {
              setMessage(m);
              refresh();
            });
          }}
        />
        <Button
          label="Остановить"
          tone="plain"
          onPress={() => {
            void stopRecording().then((m) => {
              setMessage(m);
              refresh();
            });
          }}
        />
        <Button label="Обновить" tone="plain" onPress={refresh} />
        <Button
          label="Очистить журнал"
          tone="plain"
          onPress={() => {
            clearLog();
            refresh();
          }}
        />
        <Button
          label={keepAwake ? 'Экран не гаснет: ВКЛ' : 'Экран не гаснет: выкл'}
          tone="plain"
          onPress={() => {
            setKeepAwake((v) => !v);
          }}
        />
      </View>

      <Text style={styles.section}>
        Ядро на этом телефоне ({selfCheck.filter((c) => c.ok).length} из {selfCheck.length})
      </Text>
      {selfCheck.map((c) => (
        <Row key={c.name} label={`${c.ok ? '✓' : '✗'} ${c.name}`} value={c.ok ? '' : c.detail} />
      ))}

      <Text style={styles.section}>Spikes: карта, воспроизведение, карман, уведомление</Text>
      <View style={styles.buttons}>
        <Button
          label="S2: открыть карту"
          tone="plain"
          onPress={() => {
            setScreen('map');
          }}
        />
        <Button
          label="S3: воспроизведение 10 тыс. точек"
          tone="plain"
          onPress={() => {
            setScreen('replay');
          }}
        />
        <Button
          label="S5: уведомление с кнопками"
          tone="plain"
          onPress={() => {
            setScreen('notif');
          }}
        />
        <Button
          label="S6: карманный режим"
          tone="plain"
          onPress={() => {
            setScreen('lock');
          }}
        />
      </View>

      <Text style={styles.section}>Spike S4: база данных</Text>
      <View style={styles.buttons}>
        <Button
          label="Проверить базу (без замера)"
          tone="plain"
          onPress={() => {
            runDb(0);
          }}
        />
        <Button
          label="Замер: 100 тыс. точек"
          tone="plain"
          onPress={() => {
            runDb(100_000);
          }}
        />
        <Button
          label="Замер: 1 млн точек"
          tone="plain"
          onPress={() => {
            runDb(1_000_000);
          }}
        />
      </View>
      {dbBusy === null ? null : <Text style={styles.muted}>{dbBusy}</Text>}
      {dbResult === null ? null : (
        <View>
          {dbResult.steps.map((st) => (
            <Row
              key={st.name}
              label={`${st.ok ? '✓' : '✗'} ${st.name}`}
              value={st.ok ? '' : st.detail}
            />
          ))}
          {dbResult.bench === null ? null : (
            <View>
              <Row label="Точек записано" value={String(dbResult.bench.points)} />
              <Row label="Запись, с" value={(dbResult.bench.insertMs / 1000).toFixed(1)} />
              <Row label="Строк в запросе" value={String(dbResult.bench.rowsPerQuery)} />
              <Row
                label="Запрос, медиана"
                value={`${dbResult.bench.queryMedianMs.toFixed(2)} мс`}
              />
              <Row label="Запрос, худший" value={`${dbResult.bench.queryMaxMs.toFixed(2)} мс`} />
            </View>
          )}
        </View>
      )}

      <Text style={styles.section}>Состояние</Text>
      <Row label="Последняя точка" value={lastFixAt === null ? '—' : fmtClock(lastFixAt)} />
      <Row
        label="Давно было"
        value={
          lastFixAt === null
            ? '—'
            : `${String(Math.round((Date.now() - lastFixAt) / 1000))} с назад`
        }
      />
      <Row label="Метки" value={markers.length === 0 ? '—' : markers.slice(-4).join(' · ')} />

      <Text style={styles.section}>Отчёт по записи (через @pawquest/core)</Text>
      {report === null ? (
        <Text style={styles.muted}>Точек пока нет.</Text>
      ) : (
        <View>
          <Row label="Точек получено" value={String(report.rawCount)} />
          <Row label="Принято фильтром A-01" value={String(report.acceptedCount)} />
          <Row label="Отброшено" value={JSON.stringify(report.dropped)} />
          <Row label="Длительность" value={fmtDuration(report.durationS)} />
          <Row label="Дистанция" value={`${report.distanceM.toFixed(0)} м`} />
          <Row label="В движении" value={fmtDuration(report.movingS)} />
          <Row label="Стоянки" value={fmtDuration(report.stoppedS)} />
          <Row label="Пропуски (A-03)" value={fmtDuration(report.gapS)} />
          <Row label="Пропусков >30 с (сырые)" value={String(report.rawGaps.length)} />
          <Row label="Самый долгий пропуск" value={`${report.longestRawGapS.toFixed(0)} с`} />
          <Row
            label="Медианный интервал"
            value={report.medianIntervalS === null ? '—' : `${report.medianIntervalS.toFixed(1)} с`}
          />
          <Row
            label="Медианная задержка доставки"
            value={
              report.medianDeliveryDelayS === null
                ? '—'
                : `${report.medianDeliveryDelayS.toFixed(1)} с`
            }
          />
          <Row
            label="Медианная точность"
            value={report.medianAccuracyM === null ? '—' : `${report.medianAccuracyM.toFixed(0)} м`}
          />
          <Row label="Фиктивных точек" value={String(report.mockedCount)} />
          {report.rawGaps.slice(0, 8).map((g) => (
            <Text key={g.fromTs} style={styles.muted}>
              пропуск {g.seconds.toFixed(0)} с после {fmtClock(g.fromTs)}
            </Text>
          ))}
        </View>
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  muted: { color: '#667', fontSize: 14 },
  section: { marginTop: 16, fontSize: 16, fontWeight: '600' },
  buttons: { gap: 8, marginTop: 8 },
  button: {
    backgroundColor: '#2F7D5B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPlain: { backgroundColor: '#E3EBE6' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonTextPlain: { color: '#17201A' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  rowLabel: { color: '#445', flexShrink: 1 },
  rowValue: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
