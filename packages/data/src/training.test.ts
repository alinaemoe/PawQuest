import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { recentFeed } from './feed';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import {
  SKILL_TEMPLATES,
  addAttempt,
  createSkill,
  discardSession,
  finishSession,
  getActiveSession,
  getSkill,
  lastSessionSettings,
  levelAttempts,
  listSkillSummaries,
  previousComparable,
  sessionCounts,
  sessionMoments,
  setCurrentLevel,
  startSession,
  suggestedQuality,
  undoLastAttempt,
  type Skill,
} from './training';

const MIN = 60_000;
const DAY = 86_400_000;

let env: TestEnv;
let dog: Dog;
let skill: Skill;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
  skill = createSkill(env.db, env.ctx, {
    dogId: dog.id,
    name: 'Подзыв',
    templateKey: 'recall',
    criterion: 'Подошла за 5 секунд',
    levels: [
      { title: '2 м', distanceM: 2 },
      { title: '5 м', distanceM: 5 },
      { title: '10 м', distanceM: 10 },
    ],
  });
});
afterEach(() => {
  env.db.close();
});

/** Runs a finished session with the given results, starting `daysAgo` days back. */
function runSession(
  daysAgo: number,
  results: readonly ('successful' | 'partial' | 'unsuccessful')[],
  settings: Parameters<typeof startSession>[4] = {},
  skillId = skill.id,
): string {
  const startedAt = START - daysAgo * DAY;
  const clock = env.now();
  env.advance(startedAt - clock);
  const session = startSession(env.db, env.ctx, dog.id, skillId, settings);
  for (const result of results) {
    env.advance(10_000);
    addAttempt(env.db, env.ctx, session.id, result);
  }
  env.advance(MIN);
  finishSession(env.db, env.ctx, session.id, { quality: 3 });
  env.advance(clock + 3600_000 - env.now());
  return session.id;
}

describe('templates', () => {
  it('every template climbs from easy to hard in its own axis', () => {
    for (const t of SKILL_TEMPLATES) {
      expect(t.values.length, t.key).toBeGreaterThan(0);
      const sorted = [...t.values].sort((a, b) => (t.axis === 'trigger' ? b - a : a - b));
      expect([...t.values], t.key).toEqual(sorted);
      expect(new Set(t.values).size, t.key).toBe(t.values.length);
    }
  });

  it('template keys are unique and include a custom one', () => {
    const keys = SKILL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('custom');
  });
});

describe('skills', () => {
  it('creates a skill with ordered levels and the first level current', () => {
    expect(skill.levels.map((l) => [l.position, l.title])).toEqual([
      [1, '2 м'],
      [2, '5 м'],
      [3, '10 м'],
    ]);
    expect(skill.currentLevelId).toBe(skill.levels[0]?.id);
    expect(skill.criterion).toBe('Подошла за 5 секунд');
    expect(getSkill(env.db, skill.id)).toEqual(skill);
  });

  it('needs a name and at least one level, and writes nothing otherwise', () => {
    expect(() =>
      createSkill(env.db, env.ctx, { dogId: dog.id, name: ' ', levels: [{ title: 'x' }] }),
    ).toThrow(/name/);
    expect(() => createSkill(env.db, env.ctx, { dogId: dog.id, name: 'X', levels: [] })).toThrow(
      /level/,
    );
    expect(env.db.all('SELECT COUNT(*) AS n FROM skill')[0]).toEqual({ n: 1 });
  });

  it('lists the most recently practiced skill first, never-practiced ones by name', () => {
    const wait = createSkill(env.db, env.ctx, {
      dogId: dog.id,
      name: 'Ждать',
      levels: [{ title: '3 с' }],
    });
    const eyes = createSkill(env.db, env.ctx, {
      dogId: dog.id,
      name: 'Контакт',
      levels: [{ title: 'D1' }],
    });
    runSession(5, ['successful'], {}, skill.id);
    runSession(1, ['successful'], {}, wait.id);
    const names = listSkillSummaries(env.db, dog.id).map((s) => s.name);
    expect(names).toEqual(['Ждать', 'Подзыв', 'Контакт']);
    expect(eyes.id).not.toBe(wait.id);
  });

  it('summaries carry session count, last practice and the current level; hide deleted ones', () => {
    runSession(3, ['successful', 'unsuccessful']);
    runSession(1, ['partial']);
    const [summary] = listSkillSummaries(env.db, dog.id);
    expect(summary).toMatchObject({ sessionsCount: 2, name: 'Подзыв' });
    expect(summary?.lastPracticedAt).toBe(START - DAY);
    expect(summary?.currentLevel?.title).toBe('2 м');
    softDelete(env.db, env.ctx, 'skill', skill.id);
    expect(listSkillSummaries(env.db, dog.id)).toEqual([]);
  });

  it('a running session does not count as practice', () => {
    startSession(env.db, env.ctx, dog.id, skill.id);
    expect(listSkillSummaries(env.db, dog.id)[0]).toMatchObject({
      sessionsCount: 0,
      lastPracticedAt: null,
    });
  });

  it('moving up marks the left level as achieved, moving down does not', () => {
    const [l1, l2] = skill.levels;
    setCurrentLevel(env.db, env.ctx, skill.id, l2?.id ?? '');
    let now = getSkill(env.db, skill.id);
    expect(now?.currentLevelId).toBe(l2?.id);
    expect(now?.levels[0]?.achievedAt).toBe(START);
    env.advance(DAY);
    setCurrentLevel(env.db, env.ctx, skill.id, l1?.id ?? '');
    now = getSkill(env.db, skill.id);
    expect(now?.currentLevelId).toBe(l1?.id);
    expect(now?.levels[1]?.achievedAt).toBeNull();
  });

  it('refuses a level of another skill', () => {
    const other = createSkill(env.db, env.ctx, {
      dogId: dog.id,
      name: 'Ждать',
      levels: [{ title: '3 с' }],
    });
    expect(() => {
      setCurrentLevel(env.db, env.ctx, skill.id, other.levels[0]?.id ?? '');
    }).toThrow(/another skill/);
  });
});

describe('sessions and attempts', () => {
  it('starts on the current level with the given settings and counts as active', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id, {
      context: 'park',
      distraction: 3,
      reward: 'treat',
      tzOffsetMin: 180,
    });
    expect(session).toMatchObject({
      levelId: skill.currentLevelId,
      context: 'park',
      distraction: 3,
      reward: 'treat',
      durationS: null,
      tzOffsetMin: 180,
      startedAt: START,
    });
    expect(getActiveSession(env.db, dog.id)?.id).toBe(session.id);
  });

  it('an unknown skill cannot be started', () => {
    expect(() => startSession(env.db, env.ctx, dog.id, 'missing')).toThrow(/skill/);
  });

  it('records attempts and counts them with partial as half', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    expect(sessionCounts(env.db, session.id)).toEqual({
      successful: 0,
      partial: 0,
      unsuccessful: 0,
      total: 0,
      share: null,
    });
    for (const r of ['successful', 'successful', 'partial', 'unsuccessful'] as const) {
      env.advance(1000);
      addAttempt(env.db, env.ctx, session.id, r);
    }
    expect(sessionCounts(env.db, session.id)).toEqual({
      successful: 2,
      partial: 1,
      unsuccessful: 1,
      total: 4,
      share: 0.625,
    });
  });

  it('undo removes only the newest attempt and reports when nothing is left', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    env.advance(1000);
    addAttempt(env.db, env.ctx, session.id, 'successful');
    env.advance(1000);
    addAttempt(env.db, env.ctx, session.id, 'unsuccessful');
    expect(undoLastAttempt(env.db, session.id)).toBe(true);
    expect(sessionCounts(env.db, session.id)).toMatchObject({ successful: 1, unsuccessful: 0 });
    expect(undoLastAttempt(env.db, session.id)).toBe(true);
    expect(undoLastAttempt(env.db, session.id)).toBe(false);
  });

  it('finishing stores duration, rating and note', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    env.advance(2 * MIN + 14_000);
    addAttempt(env.db, env.ctx, session.id, 'successful');
    expect(finishSession(env.db, env.ctx, session.id, { quality: 4, notes: 'жара' })).toBe(true);
    const saved = env.db.all('SELECT duration_s, quality, notes FROM training_session')[0];
    expect(saved).toEqual({ duration_s: 134, quality: 4, notes: 'жара' });
    expect(getActiveSession(env.db, dog.id)).toBeNull();
  });

  it('a session without attempts is not kept', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    expect(finishSession(env.db, env.ctx, session.id)).toBe(false);
    expect(env.db.all('SELECT COUNT(*) AS n FROM training_session')[0]).toEqual({ n: 0 });
  });

  it('discarding removes the session with its attempts', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    addAttempt(env.db, env.ctx, session.id, 'successful');
    discardSession(env.db, session.id);
    expect(env.db.all('SELECT COUNT(*) AS n FROM training_attempt')[0]).toEqual({ n: 0 });
    expect(getActiveSession(env.db, dog.id)).toBeNull();
  });

  it('suggests a rating from the success share', () => {
    expect(suggestedQuality(null)).toBeNull();
    expect(suggestedQuality(0)).toBe(1);
    expect(suggestedQuality(0.5)).toBe(3);
    expect(suggestedQuality(0.57)).toBe(3);
    expect(suggestedQuality(1)).toBe(5);
  });

  it('a running session is left out of the Today feed until it is finished', () => {
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    addAttempt(env.db, env.ctx, session.id, 'successful');
    expect(recentFeed(env.db, dog.id, 5)).toEqual([]);
    finishSession(env.db, env.ctx, session.id);
    expect(recentFeed(env.db, dog.id, 5).map((i) => i.kind)).toEqual(['session']);
  });
});

describe('history helpers', () => {
  it('finds the previous session in the same context for the comparison line', () => {
    const home = runSession(4, ['successful', 'successful', 'unsuccessful'], { context: 'home' });
    runSession(3, ['unsuccessful'], { context: 'park' });
    const current = startSession(env.db, env.ctx, dog.id, skill.id, { context: 'home' });
    const previous = previousComparable(env.db, skill.id, 'home', env.now() + 1, current.id);
    expect(previous?.counts).toMatchObject({ successful: 2, total: 3 });
    expect(previous?.startedAt).toBe(START - 4 * DAY);
    expect(home).not.toBe(current.id);
  });

  it('without a context any earlier session counts; without one at all it is null', () => {
    const current = startSession(env.db, env.ctx, dog.id, skill.id);
    expect(previousComparable(env.db, skill.id, null, env.now() + 1, current.id)).toBeNull();
    runSession(2, ['partial'], { context: 'yard' });
    const later = startSession(env.db, env.ctx, dog.id, skill.id);
    expect(previousComparable(env.db, skill.id, null, env.now() + 1, later.id)).not.toBeNull();
    expect(previousComparable(env.db, skill.id, 'street', env.now() + 1, later.id)).toBeNull();
  });

  it('remembers the settings of the last finished session', () => {
    expect(lastSessionSettings(env.db, skill.id)).toBeNull();
    runSession(3, ['successful'], { context: 'park', distraction: 2, reward: 'toy' });
    runSession(1, ['successful'], { context: 'yard', distraction: 4, reward: 'treat' });
    expect(lastSessionSettings(env.db, skill.id)).toEqual({
      levelId: skill.currentLevelId,
      context: 'yard',
      distraction: 4,
      reward: 'treat',
    });
  });

  it('lists attempts of one level with their context for the readiness hint', () => {
    runSession(3, ['successful', 'partial'], { context: 'park', tzOffsetMin: 180 });
    runSession(1, ['unsuccessful'], {});
    const level1 = skill.levels[0]?.id ?? '';
    const rows = levelAttempts(env.db, skill.id, level1);
    expect(rows.map((r) => [r.result, r.context, r.tzOffsetMin])).toEqual([
      ['successful', 'park', 180],
      ['partial', 'park', 180],
      ['unsuccessful', 'other', 0],
    ]);
    expect(levelAttempts(env.db, skill.id, skill.levels[1]?.id ?? '')).toEqual([]);
  });

  it('attempts of a session that is still running are included for the readiness hint', () => {
    const running = startSession(env.db, env.ctx, dog.id, skill.id, { context: 'yard' });
    addAttempt(env.db, env.ctx, running.id, 'successful');
    expect(levelAttempts(env.db, skill.id, skill.levels[0]?.id ?? '')).toHaveLength(1);
  });

  it('lists the start moments of finished sessions in order', () => {
    runSession(5, ['successful']);
    runSession(2, ['successful']);
    startSession(env.db, env.ctx, dog.id, skill.id); // running: not counted
    expect(sessionMoments(env.db, skill.id).map((m) => m.ts)).toEqual([
      START - 5 * DAY,
      START - 2 * DAY,
    ]);
  });
});
