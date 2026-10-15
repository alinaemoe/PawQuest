import type { Walk } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { groupWalksByDay, totalsLine, walkFacts } from './walksModel';

const ruI = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const enImp = createI18n({ locale: 'en', units: 'imperial', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 15, 11, 5); // 14:05 in Minsk
const HOUR = 3_600_000;

const walk = (id: string, startedAt: number, extra: Partial<Walk> = {}): Walk => ({
  id,
  title: null,
  status: 'completed',
  mode: 'manual',
  startedAt,
  endedAt: null,
  durationS: 1800,
  distanceM: 2100,
  placeKind: null,
  mood: null,
  distraction: null,
  notes: null,
  ...extra,
});

describe('groupWalksByDay', () => {
  it('groups consecutive walks of the same local day and keeps the order', () => {
    const groups = groupWalksByDay(
      [
        walk('a', NOW - HOUR),
        walk('b', NOW - 3 * HOUR),
        walk('c', NOW - 20 * HOUR), // yesterday evening in Minsk
        walk('d', NOW - 5 * 24 * HOUR),
      ],
      ruI,
      NOW,
    );
    expect(groups.map((g) => [g.label, g.walks.map((w) => w.id)])).toEqual([
      ['сегодня', ['a', 'b']],
      ['вчера', ['c']],
      ['10 окт', ['d']],
    ]);
  });

  it('shows time, summary and the note or title as detail', () => {
    const [group] = groupWalksByDay(
      [walk('a', NOW - HOUR, { notes: 'дождь' }), walk('b', NOW - 2 * HOUR, { title: 'Утро' })],
      ruI,
      NOW,
    );
    expect(group?.walks[0]).toMatchObject({
      time: '13:05',
      summary: '30 мин · 2,1 км',
      detail: 'дождь',
    });
    expect(group?.walks[1]?.detail).toBe('Утро');
  });

  it('leaves out what is not known and handles an empty list', () => {
    const [group] = groupWalksByDay(
      [walk('a', NOW - HOUR, { durationS: null, distanceM: null })],
      ruI,
      NOW,
    );
    expect(group?.walks[0]?.summary).toBe('');
    expect(groupWalksByDay([], ruI, NOW)).toEqual([]);
  });

  it('a walk of yesterday after midnight local time is not "today"', () => {
    const justAfterMidnight = Date.UTC(2026, 9, 14, 21, 10); // 00:10 on the 15th in Minsk
    const groups = groupWalksByDay(
      [walk('a', justAfterMidnight - 30 * 60_000)],
      ruI,
      justAfterMidnight,
    );
    expect(groups[0]?.label).toBe('вчера');
  });
});

describe('totalsLine', () => {
  it('words count, time and distance with the right plural', () => {
    expect(totalsLine({ count: 5, durationS: 13_200, distanceM: 12_000 }, ruI)).toBe(
      '5 прогулок · 3 ч 40 мин · 12 км',
    );
    expect(totalsLine({ count: 1, durationS: 1800, distanceM: 0 }, ruI)).toBe(
      '1 прогулка · 30 мин',
    );
    expect(totalsLine({ count: 2, durationS: 3600, distanceM: 3219 }, enImp)).toBe(
      '2 walks · 1 h 00 min · 2 mi',
    );
  });
});

describe('walkFacts', () => {
  it('lists duration, distance and pace', () => {
    expect(walkFacts(walk('a', NOW), ruI).map((f) => [f.label, f.value])).toEqual([
      ['Длительность', '30 мин'],
      ['Дистанция', '2,1 км'],
      ['Темп', '14:17 /км'],
    ]);
  });

  it('no pace for a short distance (under 200 m) and no distance fact without one', () => {
    expect(walkFacts(walk('a', NOW, { distanceM: 150 }), ruI).map((f) => f.label)).toEqual([
      'Длительность',
      'Дистанция',
    ]);
    expect(walkFacts(walk('a', NOW, { distanceM: null }), ruI).map((f) => f.label)).toEqual([
      'Длительность',
    ]);
    expect(walkFacts(walk('a', NOW, { durationS: null }), ruI).map((f) => f.label)).toEqual([
      'Дистанция',
    ]);
  });
});
