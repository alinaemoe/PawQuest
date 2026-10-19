import {
  cardWalks,
  chartData,
  dayWalks,
  dogFacts,
  hiddenInsightKeys,
  hideInsight,
  listPlaces,
  healthOverview,
  listWalksPage,
  placeActivity,
  skillProgress,
  periodComparison,
  thresholdSeries,
  walkCalendar,
  walkPatterns,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  buildInsights,
  calendarModel,
  chartModels,
  compareModel,
  CardWalksSheet,
  dayRows,
  DayWalksSheet,
  HideInsightSheet,
  InsightsScreen,
  healthStatsModel,
  placeCards,
  skillCards,
  thresholdCharts,
  type CalendarCellModel,
  type InsightCardModel,
} from '@pawquest/screens';
import { localDay } from '@pawquest/insights';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';

const POLL_MS = 1500;

/** The Insights tab (docs/23, step 3.5): facts, patterns, observations, "show the walks", hiding. */
export function InsightsContainer() {
  const { db, ctx, dog, i18n, version, bump, settings, updateSetting } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  const [tick, setTick] = useState(0);
  const [hiding, setHiding] = useState<InsightCardModel | null>(null);
  const [showing, setShowing] = useState<InsightCardModel | null>(null);
  const [openDay, setOpenDay] = useState<CalendarCellModel | null>(null);
  const [days, setDays] = useState<number>(14);

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

  const calendar = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return calendarModel(walkCalendar(db, dogId, now, tz, 12), localDay(now, tz), i18n);
  }, [db, dogId, i18n, version]);

  const compare = useMemo(
    () => compareModel(periodComparison(db, dogId, Date.now(), days), days, i18n),
    [db, dogId, i18n, days, version, tick],
  );

  const charts = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return chartModels(chartData(db, dogId, now, tz), localDay(now, tz), i18n);
  }, [db, dogId, i18n, version, tick]);

  const dynamics = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return thresholdCharts(thresholdSeries(db, dogId), localDay(now, tz), i18n);
  }, [db, dogId, i18n, version]);

  const places = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return placeCards(placeActivity(db, dogId, now, tz), localDay(now, tz), now, i18n);
  }, [db, dogId, i18n, version]);

  const skills = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return skillCards(skillProgress(db, dogId, now, tz), localDay(now, tz), now, i18n);
  }, [db, dogId, i18n, version]);

  const health = useMemo(() => {
    const now = Date.now();
    const tz = -new Date(now).getTimezoneOffset();
    return healthStatsModel(healthOverview(db, dogId, now, tz), localDay(now, tz), now, i18n);
  }, [db, dogId, i18n, version]);

  const dayList = useMemo(
    () => (openDay === null ? [] : dayRows(dayWalks(db, dogId, openDay.day), i18n)),
    [db, dogId, i18n, openDay, version],
  );

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
      <InsightsScreen
        model={model}
        calendar={calendar}
        onDay={setOpenDay}
        compare={{ model: compare, days, onDays: setDays }}
        charts={charts.filter((c) => c.key === 'weeks' || c.key === 'temp')}
        behaviorCharts={charts.filter((c) => c.key === 'place' || c.key === 'light')}
        dynamics={dynamics}
        section={settings.insightsSection}
        onSection={(section) => {
          updateSetting('insightsSection', section);
        }}
        places={places}
        skills={skills}
        health={health}
        onShowWalks={setShowing}
        onHide={setHiding}
      />
      <DayWalksSheet
        title={openDay === null ? null : openDay.title}
        rows={dayList}
        onClose={() => {
          setOpenDay(null);
        }}
      />
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
