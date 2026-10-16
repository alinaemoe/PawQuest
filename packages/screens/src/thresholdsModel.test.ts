import type { EventType, ThresholdSeries } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import {
  localDay,
  recoverySeries,
  reactionDistanceSeries,
  type ReactionEvent,
} from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { thresholdCharts } from './thresholdsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const DAY = 86_400_000;
const MONDAY = Date.UTC(2026, 8, 7, 9);
const today = localDay(MONDAY + 60 * DAY, 180);

const dogType: EventType = {
  id: 'dog',
  labelKey: 'event.dog',
  label: null,
  kind: 'trigger',
  color: 'dog',
  icon: 'dog',
  startsRecoveryTimer: false,
  slot: 0,
  builtin: true,
  archived: false,
};

const reactions = (weeks: number, distance: (w: number) => number): ReactionEvent[] =>
  Array.from({ length: weeks }, (_, w) =>
    [0, 1, 2].map((): ReactionEvent => ({
      ts: MONDAY + w * 7 * DAY,
      tzOffsetMin: 180,
      reaction: 3,
      distanceM: distance(w),
      bucket: null,
    })),
  ).flat();

const recovery = (weeks: number, seconds: (w: number) => number, missing = 0) =>
  recoverySeries(
    Array.from({ length: weeks }, (_, w) =>
      [0, 1, 2, 3].map((i) => ({
        ts: MONDAY + w * 7 * DAY,
        tzOffsetMin: 180,
        recoveryS: i < 3 || missing === 0 ? seconds(w) : null,
      })),
    ).flat(),
  );

describe('thresholdCharts', () => {
  it('a card per trigger with the change in the caption, and one for the recovery time', () => {
    const found: ThresholdSeries = {
      distances: [
        { type: dogType, series: reactionDistanceSeries(reactions(2, (w) => 12 - w * 5)) },
      ],
      recovery: recovery(2, (w) => 120 - w * 60, 1),
    };
    const [distance, calm] = thresholdCharts(found, today, ru);
    expect(distance?.key).toBe('distance-dog');
    expect(distance?.title).toContain('Собака');
    expect(distance?.hint).toContain('С ~12 м до ~7 м (событий: 6).');
    expect(distance?.hint).toContain('нужно хотя бы 6 недель');
    expect(distance?.bars.map((b) => b.value)).toEqual(['~12 м · 3', '~7 м · 3']);
    expect(calm?.hint).toContain('время не записано');
    expect(calm?.bars).toHaveLength(2);
  });

  it('a steady fall over six weeks is said in words, a flat series is "no direction"', () => {
    const falling = thresholdCharts(
      {
        distances: [
          { type: dogType, series: reactionDistanceSeries(reactions(6, (w) => 14 - w * 2)) },
        ],
        recovery: recovery(0, () => 0),
      },
      today,
      ru,
    );
    expect(falling[0]?.hint).toMatch(/меньше/);
    const flat = thresholdCharts(
      {
        distances: [{ type: dogType, series: reactionDistanceSeries(reactions(6, () => 10)) }],
        recovery: recovery(0, () => 0),
      },
      today,
      ru,
    );
    expect(flat[0]?.hint).toContain('Заметного направления нет');
  });

  it('a rising series is said too; with nothing recorded there is nothing to show', () => {
    const rising = thresholdCharts(
      {
        distances: [],
        recovery: recovery(6, (w) => 30 * 2 ** w),
      },
      today,
      ru,
    );
    expect(rising[0]?.hint).toMatch(/больше/);
    expect(thresholdCharts({ distances: [], recovery: recovery(0, () => 0) }, today, ru)).toEqual(
      [],
    );
  });
});
