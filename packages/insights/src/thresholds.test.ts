import { describe, expect, it } from 'vitest';

import {
  recoverySeries,
  reactionDistanceSeries,
  type ReactionEvent,
  type RecoveryEvent,
} from './thresholds';

const DAY = 86_400_000;
const MONDAY = Date.UTC(2026, 8, 7, 9); // 7 Sep 2026
const at = (week: number, day = 0): number => MONDAY + (week * 7 + day) * DAY;

const reaction = (
  week: number,
  distanceM: number | null,
  extra: Partial<ReactionEvent> = {},
): ReactionEvent => ({
  ts: at(week),
  tzOffsetMin: 180,
  reaction: 3,
  distanceM,
  bucket: null,
  ...extra,
});

describe('reactionDistanceSeries', () => {
  it('weekly medians from three events a week, first and last for the caption', () => {
    const series = reactionDistanceSeries([
      reaction(0, 12),
      reaction(0, 14),
      reaction(0, 10),
      reaction(1, 8),
      reaction(1, 9),
      reaction(1, 7),
      reaction(1, 5, { reaction: 1 }), // too mild
    ]);
    expect(series.weeks.map((w) => [w.n, w.median])).toEqual([
      [3, 12],
      [3, 8],
    ]);
    expect(series).toMatchObject({ n: 6, leftOut: 0, first: 12, last: 8 });
    expect(series.trend.label).toBe('insufficient');
  });

  it('a chip stands for its middle distance; no distance at all, or no reaction, is no point', () => {
    const series = reactionDistanceSeries([
      reaction(0, null, { bucket: 'far' }),
      reaction(0, null, { bucket: 'mid' }),
      reaction(0, null, { bucket: 'near' }),
      reaction(0, null),
      reaction(0, null, { bucket: 'strange' }),
      reaction(0, 5, { reaction: null }),
    ]);
    expect(series.weeks).toHaveLength(1);
    expect(series.weeks[0]?.median).toBe(10);
    expect(series.n).toBe(3);
  });

  it('weeks with fewer than three events are left out and counted', () => {
    const series = reactionDistanceSeries([reaction(0, 12), reaction(0, 10), reaction(2, 9)]);
    expect(series).toMatchObject({ weeks: [], n: 0, leftOut: 3, first: null, last: null });
  });

  it('a steady fall over six weeks is a trend; a mixed series is not', () => {
    const falling = Array.from({ length: 6 }, (_, w) =>
      [0, 1, 2].map((d) => reaction(w, 14 - w * 2 + d * 0.2)),
    ).flat();
    expect(reactionDistanceSeries(falling).trend).toMatchObject({ direction: 'down' });
    expect(reactionDistanceSeries(falling).trend.label).not.toBe('insufficient');
    const mixed = [10, 12, 9, 13, 10, 12].map((x, w) => [0, 1, 2].map(() => reaction(w, x))).flat();
    expect(reactionDistanceSeries(mixed).trend.label).not.toBe('clear');
  });
});

describe('recoverySeries', () => {
  const event = (week: number, recoveryS: number | null): RecoveryEvent => ({
    ts: at(week),
    tzOffsetMin: 180,
    recoveryS,
  });

  it('weekly medians with the middle half, and the share without a recorded time', () => {
    const series = recoverySeries([
      event(0, 60),
      event(0, 120),
      event(0, 180),
      event(1, 30),
      event(1, 40),
      event(1, 50),
      event(1, null),
      event(1, null),
    ]);
    expect(series.weeks[0]).toMatchObject({ n: 3, median: 120, q1: 90, q3: 150 });
    expect(series.weeks[1]?.median).toBe(40);
    expect(series).toMatchObject({ events: 8, first: 120, last: 40 });
    expect(series.missingShare).toBeCloseTo(0.25, 10);
  });

  it('no events: no series and no share', () => {
    const series = recoverySeries([]);
    expect(series).toMatchObject({ weeks: [], events: 0, missingShare: null, first: null });
  });

  it('the trend is taken on the logarithm: a halving every week is a clear fall', () => {
    const halving = Array.from({ length: 6 }, (_, w) =>
      [0, 1, 2].map(() => event(w, 640 / 2 ** w)),
    ).flat();
    expect(recoverySeries(halving).trend.direction).toBe('down');
  });
});
