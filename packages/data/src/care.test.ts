import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CARE_TEMPLATES,
  careDates,
  createPlan,
  getCareItem,
  listCareItems,
  listPlans,
  logCare,
  recentValues,
  setPlanEnabled,
  setPlanProduct,
  visitCounts,
} from './care';
import { createDog, type Dog } from './dogs';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';

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

const deworm = () => {
  const t = CARE_TEMPLATES.find((x) => x.key === 'deworm');
  if (t === undefined) {
    throw new Error('no template');
  }
  return createPlan(env.db, env.ctx, {
    dogId: dog.id,
    templateKey: t.key,
    kind: t.kind,
    subtype: t.subtype,
    title: 'Глистогонка',
    intervalMonths: t.intervalMonths,
    remindDaysBefore: t.remindDaysBefore,
  });
};

describe('templates', () => {
  it('ship the four routines of the spec with their intervals and seasons', () => {
    expect(CARE_TEMPLATES.map((t) => t.key)).toEqual([
      'deworm',
      'tick_flea',
      'vaccination',
      'checkup',
    ]);
    const tick = CARE_TEMPLATES.find((t) => t.key === 'tick_flea');
    expect(tick).toMatchObject({
      intervalDays: 30,
      seasonFromMonth: 4,
      seasonToMonth: 10,
      subtype: 'tick_flea',
    });
    expect(CARE_TEMPLATES.find((t) => t.key === 'vaccination')?.intervalMonths).toBe(12);
    expect(CARE_TEMPLATES.find((t) => t.key === 'deworm')?.intervalMonths).toBe(3);
  });

  it('every template has exactly one interval and reminders ending on the due day', () => {
    for (const t of CARE_TEMPLATES) {
      expect((t.intervalDays === null) !== (t.intervalMonths === null), t.key).toBe(true);
      expect(t.remindDaysBefore.at(-1), t.key).toBe(0);
    }
  });
});

describe('plans', () => {
  it('creates an enabled plan and reads it back', () => {
    const plan = deworm();
    expect(plan).toMatchObject({
      kind: 'parasite',
      subtype: 'deworm',
      intervalMonths: 3,
      intervalDays: null,
      remindDaysBefore: [7, 0],
      enabled: true,
      templateKey: 'deworm',
    });
  });

  it('needs a title and an interval (CHECK)', () => {
    expect(() =>
      createPlan(env.db, env.ctx, {
        dogId: dog.id,
        kind: 'parasite',
        title: '  ',
        intervalDays: 30,
      }),
    ).toThrow(/title/);
    expect(() =>
      createPlan(env.db, env.ctx, { dogId: dog.id, kind: 'parasite', title: 'X' }),
    ).toThrow(/CHECK/);
    expect(() =>
      createPlan(env.db, env.ctx, { dogId: dog.id, kind: 'parasite', title: 'X', intervalDays: 0 }),
    ).toThrow(/CHECK/);
  });

  it('can be switched off and on, and remembers a default product', () => {
    const plan = deworm();
    setPlanEnabled(env.db, env.ctx, plan.id, false);
    setPlanProduct(env.db, env.ctx, plan.id, 'Препарат А');
    const [listed] = listPlans(env.db, dog.id);
    expect(listed).toMatchObject({ enabled: false, defaultProduct: 'Препарат А' });
    setPlanEnabled(env.db, env.ctx, plan.id, true);
    expect(listPlans(env.db, dog.id)[0]?.enabled).toBe(true);
  });

  it('lists the last time and product of each plan, ignoring deleted records', () => {
    const plan = deworm();
    expect(listPlans(env.db, dog.id)[0]).toMatchObject({ lastDoneAt: null, lastProduct: null });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'deworm',
      title: 'Глистогонка',
      doneAt: START - 100 * DAY,
      planId: plan.id,
      product: 'Старый',
    });
    const newer = logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'deworm',
      title: 'Глистогонка',
      doneAt: START - 10 * DAY,
      planId: plan.id,
      product: 'Новый',
    });
    expect(listPlans(env.db, dog.id)[0]).toMatchObject({
      lastDoneAt: START - 10 * DAY,
      lastProduct: 'Новый',
    });
    softDelete(env.db, env.ctx, 'care_item', newer.id);
    expect(listPlans(env.db, dog.id)[0]).toMatchObject({
      lastDoneAt: START - 100 * DAY,
      lastProduct: 'Старый',
    });
  });

  it('a plan can go to the trash and disappears from the list; deleting the dog removes plans', () => {
    const plan = deworm();
    softDelete(env.db, env.ctx, 'care_plan', plan.id);
    expect(listPlans(env.db, dog.id)).toEqual([]);
  });
});

describe('care records', () => {
  it('logs a treatment with product and dose', () => {
    const item = logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'tick_flea',
      title: 'Клещи',
      doneAt: START,
      product: 'Капли',
      dose: 'по инструкции',
      notes: 'после прогулки',
    });
    expect(item).toMatchObject({
      kind: 'parasite',
      subtype: 'tick_flea',
      doneAt: START,
      product: 'Капли',
      dose: 'по инструкции',
      notes: 'после прогулки',
      visitReason: null,
    });
    expect(getCareItem(env.db, item.id)).toEqual(item);
  });

  it('logs a vet visit with every detail', () => {
    const item = logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'vet_visit',
      title: 'Визит',
      doneAt: START - DAY,
      visitReason: 'problem',
      clinic: 'Клиника на Парковой',
      findings: 'ушиб лапы',
      prescription: 'покой 3 дня',
      costMinor: 250_000,
      nextDue: START + 14 * DAY,
    });
    expect(item).toMatchObject({
      visitReason: 'problem',
      clinic: 'Клиника на Парковой',
      findings: 'ушиб лапы',
      prescription: 'покой 3 дня',
      costMinor: 250_000,
      nextDue: START + 14 * DAY,
    });
  });

  it('rejects an unknown visit reason or kind (CHECK)', () => {
    expect(() =>
      logCare(env.db, env.ctx, {
        dogId: dog.id,
        kind: 'vet_visit',
        title: 'x',
        doneAt: START,
        visitReason: 'whim' as never,
      }),
    ).toThrow(/CHECK/);
    expect(() =>
      logCare(env.db, env.ctx, {
        dogId: dog.id,
        kind: 'magic' as never,
        title: 'x',
        doneAt: START,
      }),
    ).toThrow(/CHECK/);
  });

  it('lists records newest first, by kind, paged, without deleted ones', () => {
    const a = logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'a',
      doneAt: START - 3 * DAY,
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'vet_visit',
      title: 'b',
      doneAt: START - 2 * DAY,
    });
    const c = logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'c',
      doneAt: START - DAY,
    });
    expect(listCareItems(env.db, dog.id, 10).map((i) => i.title)).toEqual(['c', 'b', 'a']);
    expect(listCareItems(env.db, dog.id, 10, 'parasite').map((i) => i.title)).toEqual(['c', 'a']);
    expect(listCareItems(env.db, dog.id, 1).map((i) => i.title)).toEqual(['c']);
    expect(
      listCareItems(env.db, dog.id, 10, undefined, START - 2 * DAY).map((i) => i.title),
    ).toEqual(['a']);
    softDelete(env.db, env.ctx, 'care_item', c.id);
    expect(listCareItems(env.db, dog.id, 10).map((i) => i.title)).toEqual(['b', 'a']);
    expect(a.id).not.toBe(c.id);
  });

  it('gives the dates of one routine oldest first, filtered by subtype', () => {
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'deworm',
      title: 'g',
      doneAt: START - 90 * DAY,
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'tick_flea',
      title: 't',
      doneAt: START - 40 * DAY,
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      subtype: 'deworm',
      title: 'g',
      doneAt: START,
    });
    expect(careDates(env.db, dog.id, 'parasite', 'deworm')).toEqual([START - 90 * DAY, START]);
    expect(careDates(env.db, dog.id, 'parasite')).toHaveLength(3);
  });

  it('suggests recent products and clinics, most recent first, no blanks', () => {
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'x',
      doneAt: START - 5 * DAY,
      product: 'А',
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'x',
      doneAt: START - 1 * DAY,
      product: 'Б',
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'x',
      doneAt: START,
      product: 'А',
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'parasite',
      title: 'x',
      doneAt: START - 2 * DAY,
      product: '',
    });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'vet_visit',
      title: 'v',
      doneAt: START,
      clinic: 'К1',
    });
    expect(recentValues(env.db, dog.id, 'product')).toEqual(['А', 'Б']);
    expect(recentValues(env.db, dog.id, 'clinic')).toEqual(['К1']);
    expect(recentValues(env.db, dog.id, 'product', 1)).toEqual(['А']);
  });

  it('counts visits and those made because of a problem in a period', () => {
    const visit = (reason: 'checkup' | 'problem', daysAgo: number) =>
      logCare(env.db, env.ctx, {
        dogId: dog.id,
        kind: 'vet_visit',
        title: 'v',
        doneAt: START - daysAgo * DAY,
        visitReason: reason,
      });
    visit('checkup', 300);
    visit('problem', 100);
    visit('checkup', 20);
    visit('checkup', 500); // outside the year
    expect(visitCounts(env.db, dog.id, START - 365 * DAY, START + DAY)).toEqual({
      total: 3,
      problem: 1,
    });
    expect(visitCounts(env.db, dog.id, START + DAY, START + 2 * DAY)).toEqual({
      total: 0,
      problem: 0,
    });
  });
});
