import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { skillProgress } from './skillProgress';
import { START, testEnv, type TestEnv } from './test-utils';
import {
  addAttempt,
  createSkill,
  finishSession,
  startSession,
  type AttemptResult,
  type Skill,
} from './training';

const DAY = 86_400_000;
const NOW = START + 30 * DAY;

let env: TestEnv;
let dog: Dog;
let skill: Skill;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
  skill = createSkill(env.db, env.ctx, {
    dogId: dog.id,
    name: 'Ко мне',
    levels: [{ title: '5 м' }, { title: '10 м' }, { title: '20 м' }],
  });
});
afterEach(() => {
  env.db.close();
});

/** A finished session on a day with the given results of attempts, in the given place. */
function session(
  day: number,
  results: AttemptResult[],
  context: 'home' | 'yard' | 'park' = 'home',
) {
  const at = START + day * DAY;
  const clock = (ms: number): void => {
    env.advance(at + ms - env.now());
  };
  clock(0);
  const s = startSession(env.db, env.ctx, dog.id, skill.id, {
    levelId: skill.levels[0]?.id ?? null,
    context,
    tzOffsetMin: 0,
  });
  results.forEach((r, i) => {
    clock(60_000 * (i + 1));
    addAttempt(env.db, env.ctx, s.id, r);
  });
  clock(60_000 * (results.length + 1));
  finishSession(env.db, env.ctx, s.id);
}

describe('skillProgress', () => {
  it('a skill with attempts: the rhythm, the weeks and the number of attempts', () => {
    session(20, ['successful', 'successful', 'partial']);
    session(23, ['successful', 'unsuccessful']);
    const [progress] = skillProgress(env.db, dog.id, NOW, 0);
    expect(progress?.skill.name).toBe('Ко мне');
    expect(progress?.attempts).toBe(5);
    expect(progress?.gap?.daysSince).toBe(7);
    expect(progress?.weeks).toHaveLength(8);
    expect(progress?.weeks.reduce((sum, w) => sum + w.attempts, 0)).toBe(5);
    expect(progress?.steady).toBe(false);
  });

  it('a steady level (ten good attempts in two places) is told as a hint', () => {
    session(10, ['successful', 'successful', 'successful', 'successful', 'successful'], 'home');
    session(12, ['successful', 'successful', 'successful', 'successful', 'partial'], 'park');
    expect(skillProgress(env.db, dog.id, NOW, 0)[0]?.steady).toBe(true);
  });

  it('a skill never practised has no rhythm and empty weeks; no skills, no rows', () => {
    const [progress] = skillProgress(env.db, dog.id, NOW, 0);
    expect(progress?.gap).toBeNull();
    expect(progress?.attempts).toBe(0);
    expect(progress?.weeks.every((w) => w.attempts === 0)).toBe(true);
    const other = createDog(env.db, env.ctx, { name: 'Другая' });
    expect(skillProgress(env.db, other.id, NOW, 0)).toEqual([]);
  });
});
