import { EMPTY_DETAIL, type DiaryEntry, type EventType } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { diaryRow, filledLine, groupDiaryByDay } from './diaryModel';

const ruI = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 15, 11, 5);
const HOUR = 3_600_000;

const type = (id: string, icon: string): EventType => ({
  id,
  labelKey: `event.${id}`,
  label: null,
  kind: 'trigger',
  color: 'dog',
  icon,
  startsRecoveryTimer: false,
  slot: null,
  builtin: true,
  archived: false,
});
const types = new Map([
  ['dog', type('dog', 'dog')],
  ['child', type('child', 'child')],
  ['toilet', type('toilet', 'drop')],
]);

const entry = (
  id: string,
  typeId: string,
  ts: number,
  extra: Partial<DiaryEntry['event']> = {},
  detail: Partial<DiaryEntry['detail']> = {},
): DiaryEntry => ({
  event: {
    id,
    dogId: 'd',
    walkId: null,
    typeId,
    ts,
    note: null,
    distanceBucket: null,
    reaction: null,
    distraction: null,
    recoveryS: null,
    incomplete: true,
    ...extra,
  },
  detail: { ...EMPTY_DETAIL, ...detail },
});

describe('diaryRow', () => {
  it('summarizes the facts that are known, in order', () => {
    const row = diaryRow(
      entry(
        'a',
        'dog',
        NOW - 4 * HOUR,
        { distanceBucket: 'near', reaction: 3, distraction: 2, note: 'у входа' },
        { outcome: 'calmed_fast' },
      ),
      ruI,
      types,
      NOW,
    );
    expect(row).toMatchObject({
      icon: 'circle',
      title: 'Собака',
      subtitle: 'близко · R3 · D2 · быстро успокоилась · у входа · 4 часа назад',
      incomplete: true,
    });
  });

  it('a bare tap shows only when it happened and the shape of its type', () => {
    expect(diaryRow(entry('a', 'child', NOW - 60_000), ruI, types, NOW)).toMatchObject({
      icon: 'triangle',
      subtitle: '1 минуту назад',
    });
  });

  it('a toilet entry is never "can be completed"; an unknown type falls back', () => {
    expect(diaryRow(entry('a', 'toilet', NOW), ruI, types, NOW).incomplete).toBe(false);
    expect(diaryRow(entry('a', 'mystery', NOW), ruI, types, NOW)).toMatchObject({
      icon: 'paw',
      title: 'mystery',
    });
  });

  it('a completed observation has no tag', () => {
    expect(
      diaryRow(entry('a', 'dog', NOW, { incomplete: false }), ruI, types, NOW).incomplete,
    ).toBe(false);
  });
});

describe('groupDiaryByDay', () => {
  it('groups by local day in order', () => {
    const groups = groupDiaryByDay(
      [
        entry('a', 'dog', NOW - HOUR),
        entry('b', 'dog', NOW - 2 * HOUR),
        entry('c', 'dog', NOW - 30 * HOUR),
      ],
      ruI,
      types,
      NOW,
    );
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['сегодня', ['a', 'b']],
      ['вчера', ['c']],
    ]);
    expect(groupDiaryByDay([], ruI, types, NOW)).toEqual([]);
  });
});

describe('filledLine', () => {
  it('says how many of the eight fields are filled', () => {
    expect(filledLine(entry('a', 'dog', NOW), ruI)).toBe('Заполнено 0 из 8');
    expect(
      filledLine(
        entry('a', 'dog', NOW, { reaction: 2, distanceBucket: 'far' }, { behaviors: ['bark'] }),
        ruI,
      ),
    ).toBe('Заполнено 3 из 8');
  });
});
