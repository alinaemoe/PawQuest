import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { START, testEnv, type TestEnv } from './test-utils';
import { thresholdSeries } from './thresholds';

const DAY = 86_400_000;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

const event = (
  typeId: string,
  week: number,
  extra: { reaction?: number; distanceM?: number; recoveryS?: number } = {},
): void => {
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    typeId,
    ts: START + week * 7 * DAY,
    tzOffsetMin: 0,
    incomplete: false,
    ...extra,
  });
};

describe('thresholdSeries', () => {
  it('a distance series for each kind of trigger with two good weeks, and the recovery series', () => {
    for (const [week, distance] of [
      [0, 12],
      [1, 7],
    ] as const) {
      for (let i = 0; i < 3; i += 1) {
        event('dog', week, { reaction: 3, distanceM: distance + i * 0.1 });
        event('hard', week, { recoveryS: 120 - week * 60 });
      }
    }
    event('person', 0, { reaction: 3, distanceM: 5 }); // a single event: no series
    event('hard', 1); // no recovery time written down
    const found = thresholdSeries(env.db, dog.id);
    expect(found.distances).toHaveLength(1);
    expect(found.distances[0]?.type.id).toBe('dog');
    expect(found.distances[0]?.series).toMatchObject({ n: 6 });
    expect(found.distances[0]?.series.first).toBeCloseTo(12.1, 10);
    expect(found.recovery).toMatchObject({ n: 6, events: 7, first: 120, last: 60 });
    expect(found.recovery.missingShare).toBeCloseTo(1 / 7, 10);
  });

  it('nothing recorded: empty series and nothing fails', () => {
    const found = thresholdSeries(env.db, dog.id);
    expect(found.distances).toEqual([]);
    expect(found.recovery).toMatchObject({ weeks: [], events: 0, missingShare: null });
  });

  it('the series of another dog is not mixed in', () => {
    const other = createDog(env.db, env.ctx, { name: 'Другая' });
    for (let w = 0; w < 2; w += 1) {
      for (let i = 0; i < 3; i += 1) {
        createEvent(env.db, env.ctx, {
          dogId: other.id,
          typeId: 'dog',
          ts: START + w * 7 * DAY,
          tzOffsetMin: 0,
          reaction: 3,
          distanceM: 9,
          incomplete: false,
        });
      }
    }
    expect(thresholdSeries(env.db, dog.id).distances).toEqual([]);
    expect(thresholdSeries(env.db, other.id).distances).toHaveLength(1);
  });
});
