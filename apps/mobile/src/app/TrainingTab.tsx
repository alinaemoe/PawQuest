import { listSkillSummaries, sessionMoments } from '@pawquest/data';
import { practiceGap } from '@pawquest/insights';
import { skillStatus, TrainingScreen, type SkillCardModel } from '@pawquest/screens';
import { useMemo } from 'react';

import { useApp } from './AppContext';
import type { FlowState } from './TrainingFlow';

/** The Training tab: the skill list with their status; starting goes through the shared flow. */
export function TrainingTab({ openFlow }: { openFlow: (state: FlowState) => void }) {
  const { db, dog, i18n, version } = useApp();
  const dogId = dog?.id ?? '';

  const cards = useMemo<SkillCardModel[]>(() => {
    const now = Date.now();
    const offset = -new Date().getTimezoneOffset();
    return listSkillSummaries(db, dogId).map((skill) => {
      const gap = practiceGap(sessionMoments(db, skill.id), { ts: now, tzOffsetMin: offset });
      const level = skill.currentLevel;
      return {
        id: skill.id,
        name: skill.name,
        levelText:
          level === null || skill.levels.length < 2
            ? null
            : i18n.t('training.levelOf', { n: level.position, total: skill.levels.length }),
        lastText:
          skill.lastPracticedAt === null
            ? i18n.t('training.neverPracticed')
            : i18n.t('training.practiced', { ago: i18n.formatAgo(skill.lastPracticedAt, now) }),
        sessionsText: i18n.t('training.sessions', { n: skill.sessionsCount }),
        status: skillStatus(skill, gap?.overdue === true),
      };
    });
  }, [db, dogId, i18n, version]);

  return (
    <TrainingScreen
      skills={cards}
      onStart={() => {
        openFlow({ kind: 'picker' });
      }}
      onNewSkill={() => {
        openFlow({ kind: 'template' });
      }}
      onOpenSkill={(skillId) => {
        openFlow({ kind: 'prep', skillId });
      }}
    />
  );
}
