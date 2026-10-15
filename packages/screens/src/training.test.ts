import { SKILL_TEMPLATES, type SkillSummary } from '@pawquest/data';
import { createI18n, en, ru } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { levelTitle, percent, repeatLine, skillFromTemplate, skillStatus } from './training';

const ruI = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 0 });
const enImp = createI18n({ locale: 'en', units: 'imperial', tzOffsetMin: () => 0 });

describe('levelTitle', () => {
  it('words each axis in the active units', () => {
    expect(levelTitle('distance', 5, 1, ruI)).toBe('Дистанция 5 м');
    expect(levelTitle('duration', 30, 1, ruI)).toBe('Время 30 с');
    expect(levelTitle('duration', 180, 1, ruI)).toBe('Время 3 мин');
    expect(levelTitle('distraction', 2, 1, ruI)).toBe('Отвлечение D2');
    expect(levelTitle('trigger', 10, 1, ruI)).toBe('До триггера 10 м');
    expect(levelTitle('custom', 1, 0, ruI)).toBe('Ступень 1');
    expect(levelTitle('distance', 5, 1, enImp)).toBe('Distance 16 ft');
  });
});

describe('skillFromTemplate', () => {
  it('translates name and criterion and fills the step axis', () => {
    const recall = SKILL_TEMPLATES.find((t) => t.key === 'recall');
    if (recall === undefined) {
      throw new Error('no recall template');
    }
    const input = skillFromTemplate(recall, 'dog1', ruI);
    expect(input).toMatchObject({
      dogId: 'dog1',
      name: 'Подзыв',
      templateKey: 'recall',
      criterion: 'Подошла в течение 5 секунд после сигнала',
    });
    expect(input.levels.map((l) => [l.title, l.distanceM, l.durationS, l.distraction])).toEqual([
      ['Дистанция 2 м', 2, null, null],
      ['Дистанция 5 м', 5, null, null],
      ['Дистанция 10 м', 10, null, null],
      ['Дистанция 20 м', 20, null, null],
    ]);
  });

  it('fills the right column for every axis and accepts a custom name', () => {
    for (const template of SKILL_TEMPLATES) {
      const input = skillFromTemplate(template, 'd', ruI, '  Мой навык ');
      expect(input.name).toBe('Мой навык');
      for (const level of input.levels) {
        const filled = [level.distanceM, level.durationS, level.distraction].filter(
          (v) => v !== null,
        );
        expect(filled.length, template.key).toBe(template.axis === 'custom' ? 0 : 1);
      }
    }
  });

  it('a blank custom name falls back to the template name', () => {
    const impulse = SKILL_TEMPLATES.find((t) => t.key === 'impulse');
    if (impulse === undefined) {
      throw new Error('no impulse template');
    }
    expect(skillFromTemplate(impulse, 'd', ruI, '   ').name).toBe('Выдержка');
  });

  it('every template has a name, a criterion and a level title in both languages', () => {
    for (const template of SKILL_TEMPLATES) {
      expect(`skill.${template.key}` in ru, template.key).toBe(true);
      expect(`skill.${template.key}` in en, template.key).toBe(true);
      expect(`crit.${template.key}` in ru, template.key).toBe(true);
      expect(`crit.${template.key}` in en, template.key).toBe(true);
    }
  });
});

describe('skillStatus', () => {
  const skill = (sessionsCount: number): SkillSummary => ({
    id: 's',
    dogId: 'd',
    name: 'x',
    templateKey: null,
    criterion: null,
    currentLevelId: null,
    levels: [],
    lastPracticedAt: null,
    sessionsCount,
    currentLevel: null,
  });
  it('is new with fewer than three sessions, then in progress or overdue', () => {
    expect(skillStatus(skill(0), false)).toBe('new');
    expect(skillStatus(skill(2), true)).toBe('new');
    expect(skillStatus(skill(3), false)).toBe('active');
    expect(skillStatus(skill(9), true)).toBe('overdue');
  });
});

describe('repeatLine', () => {
  it('joins what is known and skips the rest', () => {
    expect(
      repeatLine(
        { levelTitle: 'Дистанция 5 м', context: 'park', distraction: 3, reward: 'treat' },
        ruI,
      ),
    ).toBe('Дистанция 5 м · Парк · D3 · Лакомство');
    expect(
      repeatLine({ levelTitle: null, context: null, distraction: null, reward: null }, ruI),
    ).toBe('');
    expect(
      repeatLine(
        { levelTitle: 'Ступень 1', context: 'home', distraction: null, reward: null },
        ruI,
      ),
    ).toBe('Ступень 1 · Дома');
  });

  it("shows the owner's own reward text as typed", () => {
    expect(
      repeatLine({ levelTitle: null, context: null, distraction: null, reward: 'сыр' }, ruI),
    ).toBe('сыр');
  });
});

describe('percent', () => {
  it('rounds a share to whole percent and keeps null', () => {
    expect(percent(null)).toBeNull();
    expect(percent(0.625)).toBe(63);
    expect(percent(1)).toBe(100);
    expect(percent(0)).toBe(0);
  });
});
