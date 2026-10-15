import { TabBar, useTheme, type TabItem } from '@pawquest/rn-ui';
import { countIncompleteEvents, getActiveSession, listTrash } from '@pawquest/data';
import { DogScreen, OnboardingFlow, SoonScreen, type DogDraft } from '@pawquest/screens';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { useApp } from './AppContext';
import { ClickerContainer } from './ClickerContainer';
import { TodayContainer } from './TodayContainer';
import { TrashContainer } from './TrashContainer';
import { WalksTab } from './WalksTab';
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
  const [overlay, setOverlay] = useState<'trash' | null>(null);
  const [openWalk, setOpenWalk] = useState(false);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const dogId = dog?.id ?? null;
  // A session that was running when the app closed is picked up again right here (S11-9).
  const activeSession = useMemo(
    () => (dogId === null ? null : getActiveSession(app.db, dogId)),
    [app.db, dogId, app.version],
  );

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

  if (overlay === 'trash') {
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
              setOverlay('trash');
            }}
            onDiary={() => {
              // the diary screen arrives in the next step
              setOverlay(null);
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
    </View>
  );
}
