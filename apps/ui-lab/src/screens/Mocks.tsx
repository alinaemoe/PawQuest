import { feedRow, OnboardingFlow, TodayScreen } from '@pawquest/screens';
import type { EventType, FeedItem } from '@pawquest/data';
import { useI18n } from '@pawquest/rn-ui';
import { useMemo } from 'react';

const NOW = Date.now();
const HOUR = 3_600_000;

const toilet: EventType = {
  id: 'toilet',
  labelKey: 'event.toilet',
  label: null,
  kind: 'physio',
  color: 'muted',
  icon: 'drop',
  startsRecoveryTimer: false,
  slot: null,
  builtin: true,
  archived: false,
};
const dogEvent: EventType = {
  ...toilet,
  id: 'dog',
  labelKey: 'event.dog',
  icon: 'dog',
  kind: 'trigger',
};

const FEED: readonly FeedItem[] = [
  { kind: 'walk', id: 'w1', ts: NOW - 4 * HOUR, durationS: 1920, distanceM: 2100 },
  { kind: 'session', id: 's1', ts: NOW - 5 * HOUR, skillName: 'Подзыв', attempts: 7 },
  { kind: 'event', id: 'e1', ts: NOW - 26 * HOUR, typeId: 'dog', note: null },
  { kind: 'weight', id: 'g1', ts: NOW - 20 * 24 * HOUR, weightG: 6200 },
];

export function MockToday() {
  const i18n = useI18n();
  const rows = useMemo(() => {
    const types = new Map([
      ['toilet', toilet],
      ['dog', dogEvent],
    ]);
    return FEED.map((item) => feedRow(item, i18n, types, NOW));
  }, [i18n]);
  const noop = (): void => undefined;
  return (
    <TodayScreen
      now={NOW}
      dogName="Луна"
      dogPhotoUri={null}
      gpsWalks={false}
      lastWalk={{ startedAt: NOW - 4 * HOUR, durationS: 1920 }}
      weightCard={{ title: i18n.t('today.weightTitle', { n: 20 }) }}
      recent={rows}
      firstRun={false}
      onStartWalk={noop}
      onTraining={noop}
      onNote={noop}
      onToilet={noop}
      onWeightRecord={noop}
      onWeightLater={noop}
      onWeightHide={noop}
      onRecentPress={noop}
      onFab={noop}
    />
  );
}

export function MockOnboarding() {
  return (
    <OnboardingFlow
      onFinish={() => undefined}
      onDemo={() => undefined}
      onRequestPermissions={() => Promise.resolve()}
    />
  );
}
