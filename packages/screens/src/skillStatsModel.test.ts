import type { SkillProgress } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { localDay, skillWeeks, type SkillAttempt } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { skillCards } from './skillStatsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 9);
const today = localDay(NOW, 180);

const attempts = (n: number, result: SkillAttempt['result'] = 'successful'): SkillAttempt[] =>
  Array.from({ length: n }, () => ({ ts: NOW, tzOffsetMin: 180, result }));

function progress(over: Partial<SkillProgress> & { sessions?: number; last?: number | null }) {
  const { sessions = 3, last = NOW - 2 * DAY, ...rest } = over;
  return {
    skill: {
      id: 's1',
      dogId: 'd',
      name: 'Ко мне',
      templateKey: null,
      criterion: null,
      currentLevelId: 'l2',
      levels: [],
      lastPracticedAt: last,
      sessionsCount: sessions,
      currentLevel: {
        id: 'l2',
        position: 2,
        title: '10 м',
        distanceM: 10,
        durationS: null,
        distraction: null,
        achievedAt: null,
      },
    },
    gap: last === null ? null : { daysSince: 2, typicalDays: 3, overdue: false },
    weeks: skillWeeks(attempts(6), today, 3),
    attempts: 6,
    steady: false,
    ...rest,
  } satisfies SkillProgress;
}

describe('skillCards', () => {
  it('level, sessions, the last time, and a bar per week with the share and attempts', () => {
    const [card] = skillCards([progress({})], today, NOW, ru);
    expect(card?.title).toBe('Ко мне');
    expect(card?.subtitle).toBe('Ступень: 10 м · 3 занятия');
    expect(card?.footnote).toBe('Последний раз 14 окт');
    expect(card?.note).toBeNull();
    expect(card?.bars).toHaveLength(3);
    expect(card?.bars[2]).toMatchObject({ end: 1, faded: false });
    expect(card?.bars[2]?.value).toBe('100% · 6 попыток');
    expect(card?.bars[0]?.value).toBe('—');
  });

  it('a rhythm only with four sessions or more; "today" and "not yet" are words, not dates', () => {
    const four = skillCards([progress({ sessions: 4 })], today, NOW, ru)[0];
    expect(four?.footnote).toBe('Последний раз 14 окт · обычно раз в 3 дн.');
    const todayCard = skillCards(
      [progress({ gap: { daysSince: 0, typicalDays: 3, overdue: false } })],
      today,
      NOW,
      ru,
    )[0];
    expect(todayCard?.footnote).toBe('Занимались сегодня');
    const never = skillCards(
      [progress({ last: null, sessions: 0, attempts: 0 })],
      today,
      NOW,
      ru,
    )[0];
    expect(never?.footnote).toBe('Пока не занимались');
    expect(never?.enough).toBe(false);
  });

  it('only soft words: a steady level is a hint, a long pause is not a reproach', () => {
    const steady = skillCards([progress({ steady: true })], today, NOW, ru)[0];
    expect(steady?.note).toContain('решать вам');
    const idle = skillCards(
      [progress({ gap: { daysSince: 12, typicalDays: 3, overdue: true } })],
      today,
      NOW,
      ru,
    )[0];
    expect(idle?.note).toContain('без спешки');
  });

  it('a week with few attempts is faded; with none it is a dash', () => {
    const few = progress({ weeks: skillWeeks(attempts(2, 'partial'), today, 2) });
    const [card] = skillCards([few], today, NOW, ru);
    expect(card?.bars[1]).toMatchObject({ faded: true, end: 0.5 });
    expect(card?.bars[0]?.faded).toBe(false);
  });
});
