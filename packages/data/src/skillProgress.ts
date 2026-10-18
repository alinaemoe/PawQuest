import {
  levelReadiness,
  localDay,
  practiceGap,
  skillWeeks,
  type PracticeGap,
  type SkillAttempt,
  type SkillWeek,
} from '@pawquest/insights';

import { fromIso } from './ids';
import type { SqlDb } from './sql';
import {
  levelAttempts,
  listSkillSummaries,
  sessionMoments,
  type AttemptResult,
  type SkillSummary,
} from './training';

export interface SkillProgress {
  readonly skill: SkillSummary;
  /** Days since the last practice and the usual rhythm; null for a skill never practised. */
  readonly gap: PracticeGap | null;
  /** The last eight weeks, the week of today last. */
  readonly weeks: readonly SkillWeek[];
  /** All attempts so far. */
  readonly attempts: number;
  /** The current level goes well and has been tried in more than one place or day (a hint only). */
  readonly steady: boolean;
}

const WEEKS = 8;

/**
 * How each skill of a dog is going (docs/23, step 3.14): the practice rhythm, the attempts week
 * by week and a soft "steady" hint for the current level. Everything is a description: nothing is
 * required of the owner or of the dog, and a skill with few attempts just shows few.
 */
export function skillProgress(
  db: SqlDb,
  dogId: string,
  now: number,
  tzOffsetMin: number,
): SkillProgress[] {
  const today = localDay(now, tzOffsetMin);
  return listSkillSummaries(db, dogId).map((skill) => {
    const attempts: SkillAttempt[] = db
      .all(
        `SELECT a.ts, a.result, t.tz_offset_min
           FROM training_attempt a JOIN training_session t ON t.id = a.session_id
          WHERE t.skill_id = ? AND t.deleted_at IS NULL ORDER BY a.ts`,
        [skill.id],
      )
      .map((r) => ({
        ts: fromIso(String(r['ts'])),
        tzOffsetMin: Number(r['tz_offset_min']),
        result: String(r['result']) as AttemptResult,
      }));
    return {
      skill,
      gap: practiceGap(sessionMoments(db, skill.id), { ts: now, tzOffsetMin }),
      weeks: skillWeeks(attempts, today, WEEKS),
      attempts: attempts.length,
      steady:
        skill.currentLevelId !== null &&
        levelReadiness(levelAttempts(db, skill.id, skill.currentLevelId)).ready,
    };
  });
}
