import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { EventType, FeedItem } from '@pawquest/data';
import { createI18n, en, ru } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { eventTypeLabel, feedRow, lastWalkLine, weightCardTitle } from './model';

const ruI = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const enI = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });
const NOW = Date.UTC(2026, 9, 15, 11, 5);
const HOUR = 3_600_000;

const type = (
  id: string,
  icon: string,
  labelKey: string | null,
  label: string | null,
): EventType => ({
  id,
  labelKey,
  label,
  kind: 'note',
  color: 'muted',
  icon,
  startsRecoveryTimer: false,
  slot: null,
  builtin: labelKey !== null,
  archived: false,
});
const types = new Map<string, EventType>([
  ['toilet', type('toilet', 'drop', 'event.toilet', null)],
  ['mine', type('mine', 'weird', null, 'Своя метка')],
]);

describe('feedRow', () => {
  it('walk: duration, distance and when', () => {
    const item: FeedItem = {
      kind: 'walk',
      id: 'w',
      ts: NOW - 4 * HOUR,
      durationS: 1920,
      distanceM: 1840,
    };
    expect(feedRow(item, ruI, types, NOW)).toMatchObject({
      icon: 'pin',
      title: 'Прогулка',
      subtitle: '32 мин · 1,84 км · 4 часа назад',
    });
  });

  it('walk without distance or duration leaves them out', () => {
    const item: FeedItem = {
      kind: 'walk',
      id: 'w',
      ts: NOW - HOUR,
      durationS: null,
      distanceM: null,
    };
    expect(feedRow(item, enI, types, NOW).subtitle).toBe('1 hour ago');
  });

  it('session: skill name and plural attempts', () => {
    const item: FeedItem = {
      kind: 'session',
      id: 's',
      ts: NOW - 60_000,
      skillName: 'Подзыв',
      attempts: 7,
    };
    expect(feedRow(item, ruI, types, NOW)).toMatchObject({
      icon: 'target',
      title: 'Подзыв',
      subtitle: '7 попыток · 1 минуту назад',
    });
    expect(feedRow({ ...item, attempts: 1 }, ruI, types, NOW).subtitle).toContain('1 попытка');
  });

  it('event: built-in label, own label, unknown type, note', () => {
    const base = { kind: 'event' as const, id: 'e', ts: NOW - 30_000, note: null };
    expect(feedRow({ ...base, typeId: 'toilet' }, ruI, types, NOW)).toMatchObject({
      icon: 'drop',
      title: 'Туалет',
      subtitle: 'только что',
    });
    expect(feedRow({ ...base, typeId: 'mine', note: 'у входа' }, ruI, types, NOW)).toMatchObject({
      icon: 'paw',
      title: 'Своя метка',
      subtitle: 'у входа · только что',
    });
    expect(feedRow({ ...base, typeId: 'gone' }, ruI, types, NOW).title).toBe('gone');
  });

  it('symptom and weight', () => {
    expect(
      feedRow({ kind: 'symptom', id: 'y', ts: NOW, symptom: 'cough' }, ruI, types, NOW).title,
    ).toBe('Симптом');
    expect(
      feedRow({ kind: 'weight', id: 'g', ts: NOW - 2 * HOUR, weightG: 6200 }, ruI, types, NOW),
    ).toMatchObject({ icon: 'scale', subtitle: '6,2 кг · 2 часа назад' });
  });
});

describe('eventTypeLabel', () => {
  it('falls back to the id when the type is unknown and to the id for a nameless custom type', () => {
    expect(eventTypeLabel(undefined, 'x', ruI)).toBe('x');
    expect(eventTypeLabel(type('y', 'note', null, null), 'y', ruI)).toBe('y');
  });
});

describe('lastWalkLine', () => {
  it('shows the empty state, a short form and the full form', () => {
    expect(lastWalkLine(null, ruI, NOW)).toBe('Здесь появится история');
    expect(lastWalkLine({ startedAt: NOW - 4 * HOUR, durationS: null }, ruI, NOW)).toBe(
      'Последняя прогулка 4 часа назад',
    );
    expect(lastWalkLine({ startedAt: NOW - 4 * HOUR, durationS: 1920 }, enI, NOW)).toBe(
      'Last walk 4 hours ago · 32 min',
    );
  });
});

describe('weightCardTitle', () => {
  it('counts whole days with the right plural, or says there is no weight yet', () => {
    const at = (days: number) => ({
      id: 'x',
      measuredAt: NOW - days * 24 * HOUR - HOUR,
      weightG: 6000,
      conditions: null,
      notes: null,
    });
    expect(weightCardTitle(null, ruI, NOW)).toBe('Вес ещё не записан');
    expect(weightCardTitle(at(18), ruI, NOW)).toBe('Не взвешивали 18 дней');
    expect(weightCardTitle(at(21), ruI, NOW)).toBe('Не взвешивали 21 день');
    expect(weightCardTitle(at(23), enI, NOW)).toBe('Not weighed for 23 days');
  });
});

describe('built-in event types and the dictionary', () => {
  it('every label_key seeded by the migration has a translation in RU and EN', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('../../data/migrations/0003_event_types.sql', import.meta.url)),
      'utf8',
    );
    const keys = [...sql.matchAll(/'(event\.[a-z]+)'/g)].map((m) => m[1] ?? '');
    expect(keys).toHaveLength(16);
    for (const key of keys) {
      expect(key in ru, key).toBe(true);
      expect(key in en, key).toBe(true);
    }
  });
});
