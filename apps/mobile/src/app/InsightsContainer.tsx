import {
  cardWalks,
  dogFacts,
  hiddenInsightKeys,
  hideInsight,
  listPlaces,
  listWalksPage,
  walkPatterns,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  buildInsights,
  CardWalksSheet,
  HideInsightSheet,
  InsightsScreen,
  type InsightCardModel,
} from '@pawquest/screens';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';

const POLL_MS = 1500;

/** The Insights tab (docs/23, step 3.5): facts, patterns, observations, "show the walks", hiding. */
export function InsightsContainer() {
  const { db, ctx, dog, i18n, version, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  const [tick, setTick] = useState(0);
  const [hiding, setHiding] = useState<InsightCardModel | null>(null);
  const [showing, setShowing] = useState<InsightCardModel | null>(null);

  const model = useMemo(() => {
    const now = Date.now();
    const patterns = walkPatterns(db, dogId, { excludeKeys: hiddenInsightKeys(db, now) });
    const names = new Map(listPlaces(db).map((p) => [p.id, p.name]));
    const starts = new Map(listWalksPage(db, dogId, 5000).map((w) => [w.id, w.startedAt]));
    const facts = dogFacts(db, dogId, now, -new Date(now).getTimezoneOffset());
    return buildInsights(
      { patterns, facts, placeName: (id) => names.get(id), startOf: (id) => starts.get(id), now },
      i18n,
    );
  }, [db, dogId, i18n, version, tick]);

  // while the background counting is still going, look again from time to time
  useEffect(() => {
    if (!model.counting) {
      return;
    }
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [model.counting]);

  const rows = useMemo(() => {
    if (showing === null) {
      return [];
    }
    const now = Date.now();
    return cardWalks(db, dogId, showing.group).map((w) => ({
      key: w.walkId,
      when: [
        i18n.formatDate(w.startedAt, now),
        w.durationS === null ? null : i18n.formatDuration(w.durationS),
      ]
        .filter((part) => part !== null)
        .join(' · '),
      hit: w.hit,
    }));
  }, [db, dogId, i18n, showing]);

  const hide = (forever: boolean): void => {
    if (hiding !== null) {
      hideInsight(db, ctx, hiding.key, forever);
      setHiding(null);
      bump();
      toast.show({ message: i18n.t('insights.hidden') });
    }
  };

  return (
    <>
      <InsightsScreen model={model} onShowWalks={setShowing} onHide={setHiding} />
      <HideInsightSheet
        card={hiding}
        onWeek={() => {
          hide(false);
        }}
        onForever={() => {
          hide(true);
        }}
        onClose={() => {
          setHiding(null);
        }}
      />
      <CardWalksSheet
        card={showing}
        rows={rows}
        onClose={() => {
          setShowing(null);
        }}
      />
    </>
  );
}
