import {
  addAttempt,
  finishSession,
  getSkill,
  levelAttempts,
  previousComparable,
  sessionCounts,
  setCurrentLevel,
  suggestedQuality,
  undoLastAttempt,
  type AttemptResult,
  type TrainingSession,
} from '@pawquest/data';
import { levelReadiness } from '@pawquest/insights';
import { useToast } from '@pawquest/rn-ui';
import { ClickerScreen, percent, SummarySheet, type SummaryModel } from '@pawquest/screens';
import { useKeepAwake } from 'expo-keep-awake';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

/** The running session: the clicker, and the summary sheet after "Stop". */
export function ClickerContainer({ session }: { session: TrainingSession }) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  useKeepAwake();

  const skill = useMemo(() => getSkill(db, session.skillId), [db, session.skillId, version]);
  const counts = useMemo(() => sessionCounts(db, session.id), [db, session.id, version]);
  const level = skill?.levels.find((l) => l.id === session.levelId) ?? null;

  const summary = useMemo<SummaryModel | null>(() => {
    if (!summaryOpen || skill === null) {
      return null;
    }
    const previous = previousComparable(db, skill.id, session.context, Date.now(), session.id);
    const readiness = level === null ? null : levelReadiness(levelAttempts(db, skill.id, level.id));
    const next = skill.levels.find((l) => level !== null && l.position === level.position + 1);
    return {
      skillName: skill.name,
      percent: percent(counts.share),
      successful: counts.successful,
      partial: counts.partial,
      unsuccessful: counts.unsuccessful,
      lastText:
        previous === null
          ? null
          : i18n.t('sum.last', {
              ago: i18n.formatAgo(previous.startedAt, Date.now()),
              ok: previous.counts.successful,
              total: previous.counts.total,
            }),
      suggestedQuality: suggestedQuality(counts.share),
      readyText:
        readiness?.ready === true && next !== undefined
          ? i18n.t('sum.ready', {
              n: readiness.n,
              pct: Math.round((readiness.share ?? 0) * 100),
              next: next.position,
            })
          : null,
    };
  }, [summaryOpen, skill, db, session, counts, level, i18n]);

  const finish = (quality: number | null, notes: string, moveUp: boolean): void => {
    const saved = finishSession(db, ctx, session.id, {
      quality,
      notes: notes === '' ? null : notes,
    });
    if (saved && moveUp && skill !== null && level !== null) {
      const next = skill.levels.find((l) => l.position === level.position + 1);
      if (next !== undefined) {
        setCurrentLevel(db, ctx, skill.id, next.id);
      }
    }
    setSummaryOpen(false);
    bump();
    toast.show({ message: i18n.t(saved ? 'training.saved' : 'training.discarded') });
  };

  return (
    <>
      <ClickerScreen
        skillName={skill?.name ?? ''}
        levelText={level?.title ?? null}
        startedAt={session.startedAt}
        successful={counts.successful}
        partial={counts.partial}
        unsuccessful={counts.unsuccessful}
        share={counts.share}
        onResult={(result: AttemptResult) => {
          addAttempt(db, ctx, session.id, result);
          bump();
        }}
        onUndo={() => {
          undoLastAttempt(db, session.id);
          bump();
        }}
        onStop={() => {
          if (counts.total === 0) {
            finish(null, '', false);
          } else {
            setSummaryOpen(true);
          }
        }}
      />
      <SummarySheet
        visible={summaryOpen}
        summary={summary}
        onSave={({ quality, notes, moveUp }) => {
          finish(quality, notes, moveUp);
        }}
        onDiscard={() => {
          setSummaryOpen(false);
        }}
      />
    </>
  );
}
