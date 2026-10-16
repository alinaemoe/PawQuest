import { TabBar, useTheme, type TabItem } from '@pawquest/rn-ui';
import {
  countIncompleteEvents,
  getActiveSession,
  getActiveWalk,
  listTrash,
  recoverWalk,
  updateDog,
} from '@pawquest/data';
import {
  DogEditSheet,
  DogScreen,
  OnboardingFlow,
  RecoverSheet,
  SoonScreen,
  type DogDraft,
} from '@pawquest/screens';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { useApp } from './AppContext';
import { ClickerContainer } from './ClickerContainer';
import { CareFlow, type CareTarget } from './CareFlow';
import { DiaryContainer } from './DiaryContainer';
import { HealthContainer } from './HealthContainer';
import { PlacesContainer } from './PlacesContainer';
import { QuickMarksContainer } from './QuickMarksContainer';
import { TodayContainer } from './TodayContainer';
import { TrashContainer } from './TrashContainer';
import { WalkContainer, WalkSummaryContainer } from './WalkContainer';
import { startGpsUpdates } from './walkRecorder';
import { WalksTab } from './WalksTab';
import { syncCareReminders } from './reminders';
import { StartWalkFlow } from './StartWalkFlow';
import { TrainingFlow, type FlowState } from './TrainingFlow';
import { TrainingTab } from './TrainingTab';

type Tab = 'today' | 'walks' | 'training' | 'insights' | 'dog';

/** Asks for the permissions the walks will need; a refusal is fine, the app asks again later. */
async function requestPermissions(): Promise<void> {
  try {
    await Location.requestForegroundPermissionsAsync();
    await Notifications.requestPermissionsAsync();
  } catch {
    // the user can grant them later, when a walk starts
  }
}

function approxMonths(draft: DogDraft): number | null {
  if (draft.ageYears === null && draft.ageMonths === null) {
    return null;
  }
  return (draft.ageYears ?? 0) * 12 + (draft.ageMonths ?? 0);
}

export function Root() {
  const app = useApp();
  const { theme } = useTheme();
  const { i18n, settings, dog } = app;
  const [tab, setTab] = useState<Tab>('today');
  const [diagnostics, setDiagnostics] = useState(false);
  const [overlay, setOverlay] = useState<
    | { kind: 'trash' }
    | { kind: 'health' }
    | { kind: 'places' }
    | { kind: 'marks' }
    | { kind: 'diary'; open: string | null }
    | null
  >(null);
  const [openWalk, setOpenWalk] = useState(false);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [care, setCare] = useState<CareTarget | null>(null);
  const [editingDog, setEditingDog] = useState(false);
  const [prewalk, setPrewalk] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [summaryWalkId, setSummaryWalkId] = useState<string | null>(null);
  const careFlow = (
    <CareFlow
      target={care}
      onClose={() => {
        setCare(null);
      }}
    />
  );
  const dogId = dog?.id ?? null;
  // A session that was running when the app closed is picked up again right here (S11-9).
  const activeSession = useMemo(
    () => (dogId === null ? null : getActiveSession(app.db, dogId)),
    [app.db, dogId, app.version],
  );

  const activeWalk = useMemo(
    () => (dogId === null ? null : getActiveWalk(app.db, dogId)),
    [app.db, dogId, app.version],
  );
  // A walk that is still running when the app starts was interrupted: offer to recover it.
  const [recoverId, setRecoverId] = useState<string | null>(() => activeWalk?.id ?? null);

  // Keep the phone's scheduled care reminders in step with the plans after every change.
  useEffect(() => {
    if (dogId === null) {
      return;
    }
    void syncCareReminders(app.db, app.i18n, dogId)
      .then((count) => {
        // visible in logcat: how many care reminders are scheduled
        console.warn(`[pq-care] reminders scheduled: ${String(count)}`);
      })
      .catch((error: unknown) => {
        console.warn(`[pq-care] scheduling failed: ${String(error)}`);
      });
  }, [app.db, app.i18n, dogId, app.version]);

  // Back from Diagnostics returns to the Dog tab; on the root tabs the system minimizes the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay !== null) {
        setOverlay(null);
        return true;
      }
      if (diagnostics) {
        setDiagnostics(false);
        return true;
      }
      return false;
    });
    return () => {
      subscription.remove();
    };
  }, [diagnostics, overlay]);

  const onWalkSheetShown = useCallback(() => {
    setOpenWalk(false);
  }, []);

  const statusBar = <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;

  if (!settings.onboardingDone || dog === null) {
    return (
      <>
        {statusBar}
        <OnboardingFlow
          onDemo={app.startDemo}
          onRequestPermissions={requestPermissions}
          onFinish={(draft, wantsWalk) => {
            app.completeOnboarding(
              {
                name: draft.name,
                approxAgeMonths: approxMonths(draft),
                size: draft.size,
                sex: draft.sex,
                breed: draft.breed === '' ? null : draft.breed,
              },
              [...draft.goals],
            );
            setTab('today');
            setOpenWalk(wantsWalk);
          }}
        />
      </>
    );
  }

  if (activeSession !== null) {
    return (
      <>
        {statusBar}
        <ClickerContainer session={activeSession} />
      </>
    );
  }

  if (summaryWalkId !== null) {
    return (
      <>
        {statusBar}
        <WalkSummaryContainer
          walkId={summaryWalkId}
          onDone={() => {
            setSummaryWalkId(null);
          }}
        />
      </>
    );
  }

  if (activeWalk !== null && dogId !== null) {
    return (
      <>
        {statusBar}
        <WalkContainer
          walk={activeWalk}
          dogId={dogId}
          keepAwake={keepAwake}
          onTraining={() => {
            setFlow({ kind: 'picker' });
          }}
          onFinished={setSummaryWalkId}
        />
        <TrainingFlow state={flow} onChange={setFlow} />
        <RecoverSheet
          visible={recoverId === activeWalk.id}
          description={`${app.i18n.formatDuration((Date.now() - activeWalk.startedAt) / 1000)} · ${app.i18n.formatTime(activeWalk.startedAt)}`}
          onContinue={() => {
            recoverWalk(app.db, app.ctx, activeWalk.id, 'continue');
            if (activeWalk.mode === 'gps') {
              void startGpsUpdates(app.i18n.t('active.notifTitle'), app.i18n.t('active.notifBody'));
            }
            setRecoverId(null);
            app.bump();
          }}
          onFinish={() => {
            const done = recoverWalk(app.db, app.ctx, activeWalk.id, 'finish');
            setRecoverId(null);
            if (done !== null) {
              setSummaryWalkId(done.id);
            }
            app.bump();
          }}
          onDiscard={() => {
            recoverWalk(app.db, app.ctx, activeWalk.id, 'discard');
            setRecoverId(null);
            app.bump();
          }}
        />
      </>
    );
  }

  if (diagnostics) {
    return (
      <>
        {statusBar}
        <DiagnosticsScreen
          onBack={() => {
            setDiagnostics(false);
          }}
        />
      </>
    );
  }

  if (overlay?.kind === 'diary') {
    return (
      <>
        {statusBar}
        <DiaryContainer
          initialOpen={overlay.open}
          onBack={() => {
            setOverlay(null);
          }}
        />
      </>
    );
  }

  if (overlay?.kind === 'health') {
    return (
      <>
        {statusBar}
        <HealthContainer
          openCare={setCare}
          onBack={() => {
            setOverlay(null);
          }}
        />
        {careFlow}
      </>
    );
  }

  if (overlay?.kind === 'marks') {
    return (
      <>
        {statusBar}
        <QuickMarksContainer
          onBack={() => {
            setOverlay(null);
          }}
        />
      </>
    );
  }

  if (overlay?.kind === 'places') {
    return (
      <>
        {statusBar}
        <PlacesContainer
          onBack={() => {
            setOverlay(null);
          }}
        />
      </>
    );
  }

  if (overlay?.kind === 'trash') {
    return (
      <>
        {statusBar}
        <TrashContainer
          onBack={() => {
            setOverlay(null);
          }}
        />
      </>
    );
  }

  const tabs: readonly TabItem<Tab>[] = [
    { id: 'today', label: i18n.t('tab.today'), icon: 'home' },
    { id: 'walks', label: i18n.t('tab.walks'), icon: 'pin' },
    { id: 'training', label: i18n.t('tab.training'), icon: 'target' },
    { id: 'insights', label: i18n.t('tab.insights'), icon: 'chart' },
    { id: 'dog', label: i18n.t('tab.dog'), icon: 'paw' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {statusBar}
      <View style={{ flex: 1 }}>
        {tab === 'today' ? (
          <TodayContainer
            autoOpenWalk={openWalk}
            onWalkSheetShown={onWalkSheetShown}
            onTraining={() => {
              setFlow({ kind: 'picker' });
            }}
            onObservation={(id) => {
              setOverlay({ kind: 'diary', open: id });
            }}
            onCare={setCare}
            onStartWalk={() => {
              setPrewalk(true);
            }}
          />
        ) : null}
        {tab === 'walks' ? <WalksTab /> : null}
        {tab === 'training' ? <TrainingTab openFlow={setFlow} /> : null}
        {tab === 'insights' ? (
          <SoonScreen icon="chart" title={i18n.t('tab.insights')} text={i18n.t('soon.insights')} />
        ) : null}
        {tab === 'dog' ? (
          <DogScreen
            dog={dog}
            language={settings.language}
            units={settings.units}
            palette={settings.palette}
            scheme={settings.scheme}
            haptics={settings.haptics}
            onLanguage={(language) => {
              app.updateSetting('language', language);
            }}
            onUnits={(units) => {
              app.updateSetting('units', units);
            }}
            onPalette={(palette) => {
              app.updateSetting('palette', palette);
            }}
            onScheme={(scheme) => {
              app.updateSetting('scheme', scheme);
            }}
            onHaptics={(on) => {
              app.updateSetting('haptics', on);
            }}
            trashCount={listTrash(app.db).length}
            incompleteCount={countIncompleteEvents(app.db, dog.id)}
            onTrash={() => {
              setOverlay({ kind: 'trash' });
            }}
            onDiary={() => {
              setOverlay({ kind: 'diary', open: null });
            }}
            onHealth={() => {
              setOverlay({ kind: 'health' });
            }}
            onPlaces={() => {
              setOverlay({ kind: 'places' });
            }}
            onMarks={() => {
              setOverlay({ kind: 'marks' });
            }}
            onEditProfile={() => {
              setEditingDog(true);
            }}
            onDiagnostics={() => {
              setDiagnostics(true);
            }}
            onRemoveDemo={app.removeDemo}
          />
        ) : null}
      </View>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      <TrainingFlow state={flow} onChange={setFlow} />
      <StartWalkFlow
        visible={prewalk}
        onClose={() => {
          setPrewalk(false);
        }}
        onStarted={(awake) => {
          setKeepAwake(awake);
          setPrewalk(false);
        }}
      />
      <DogEditSheet
        visible={editingDog}
        dog={dog}
        onClose={() => {
          setEditingDog(false);
        }}
        onSave={(edit) => {
          updateDog(app.db, app.ctx, dog.id, edit);
          setEditingDog(false);
          app.bump();
        }}
      />
      {careFlow}
    </View>
  );
}
