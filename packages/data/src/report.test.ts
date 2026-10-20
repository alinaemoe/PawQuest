import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { logCare } from './care';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { createPlace, setWalkPlace } from './places';
import { buildReport, type ReportOptions, REPORT_SECTIONS } from './report';
import { addAttempt, createSkill, finishSession, startSession } from './training';
import { START, testEnv, type TestEnv } from './test-utils';
import { addWeight } from './weights';
import { createManualWalk } from './walks';

const DAY = 86_400_000;
const NOW = START + 60 * DAY;

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни', breed: 'Лабрадор', sex: 'female' });
});
afterEach(() => {
  env.db.close();
});

const options = (extra: Partial<ReportOptions> = {}): ReportOptions => ({
  dogId: dog.id,
  fromTs: START,
  toTs: NOW,
  sections: REPORT_SECTIONS,
  includeNotes: false,
  ...extra,
});

function walk(day: number, minutes: number, distanceM: number): string {
  return createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START + day * DAY,
    durationS: minutes * 60,
    distanceM,
  }).id;
}

function trigger(walkId: string | null, day: number, extra: Record<string, unknown> = {}): void {
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    walkId,
    typeId: 'dog',
    ts: START + day * DAY + 600_000,
    tzOffsetMin: 0,
    incomplete: false,
    ...extra,
  });
}

describe('buildReport', () => {
  it('numbers of the period: walks, way, time, triggers per hour and the calming-down time with its n', () => {
    const a = walk(1, 60, 3000);
    const b = walk(3, 60, 2000);
    walk(80, 60, 9000); // outside the period
    trigger(a, 1, { recoveryS: 60, reaction: 3, distanceBucket: 'near' });
    trigger(a, 1, { recoveryS: 120, reaction: 4, distanceBucket: 'far' });
    trigger(b, 3, { recoveryS: 300 });
    const report = buildReport(env.db, options(), NOW);
    expect(report?.summary).toMatchObject({
      walks: 2,
      distanceM: 5000,
      durationS: 7200,
      activeDays: 2,
      triggers: 3,
      recoveryN: 3,
      recoveryMedianS: 120,
    });
    expect(report?.summary.triggersPerHour).toBeCloseTo(1.5, 5);
    expect(report?.dog).toMatchObject({ name: 'Фрэнни', breed: 'Лабрадор' });
  });

  it('a rate per hour needs an hour of walks in all', () => {
    const a = walk(1, 20, 500);
    trigger(a, 1);
    expect(buildReport(env.db, options(), NOW)?.summary.triggersPerHour).toBeNull();
  });

  it('weeks: full 7-day buckets ending at the end of the period, with walks and triggers in them', () => {
    const w = walk(58, 30, 1000);
    trigger(w, 58);
    walk(10, 30, 1500);
    const report = buildReport(env.db, options(), NOW);
    const weeks = report?.weeks ?? [];
    expect(weeks.length).toBe(Math.ceil((NOW - START) / (7 * DAY)));
    expect(weeks[weeks.length - 1]).toMatchObject({ walks: 1, distanceM: 1000, triggers: 1 });
    expect(weeks.reduce((sum, x) => sum + x.walks, 0)).toBe(2);
  });

  it('situations: by type, most frequent first, with the share of distances and the recovery median', () => {
    const w = walk(1, 60, 3000);
    trigger(w, 1, { distanceBucket: 'near', recoveryS: 100, reaction: 4 });
    trigger(w, 1, { distanceBucket: 'near', recoveryS: 200, reaction: 2 });
    trigger(w, 2, { typeId: 'person', distanceBucket: 'far' });
    const report = buildReport(env.db, options(), NOW);
    const [first, second] = report?.situations ?? [];
    expect(first).toMatchObject({ typeId: 'dog', count: 2, near: 2, recoveryMedianS: 150 });
    expect(first?.reactionMean).toBe(3);
    expect(second).toMatchObject({ typeId: 'person', count: 1, far: 1, recoveryMedianS: null });
  });

  it("the owner's words go in only when asked for, in examples and in notes", () => {
    const park = createPlace(env.db, env.ctx, {
      name: 'Парк',
      category: 'park',
      label: 'Парк',
      lat: 55,
      lon: 37,
    });
    const w = walk(1, 60, 3000);
    setWalkPlace(env.db, env.ctx, w, { placeId: park.id, placeKind: null });
    trigger(w, 1, { note: 'тянула к собаке' });
    const quiet = buildReport(env.db, options(), NOW);
    expect(quiet?.examples[0]).toMatchObject({ placeName: 'Парк', note: null });
    expect(quiet?.notes).toEqual([]);
    const open = buildReport(env.db, options({ includeNotes: true }), NOW);
    expect(open?.examples[0]?.note).toBe('тянула к собаке');
    expect(open?.notes[0]).toMatchObject({ source: 'event', text: 'тянула к собаке' });
  });

  it('health: the weighing before the period starts the line, care records with what and when next', () => {
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 24_000, measuredAt: START - 5 * DAY });
    addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 25_000, measuredAt: START + 20 * DAY });
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'vaccination',
      title: 'Комплексная прививка',
      doneAt: START + 10 * DAY,
      nextDue: START + 375 * DAY,
      product: 'Нобивак',
    });
    const report = buildReport(env.db, options(), NOW);
    expect(report?.weights.map((x) => x.grams)).toEqual([24_000, 25_000]);
    expect(report?.care[0]).toMatchObject({ title: 'Комплексная прививка', product: 'Нобивак' });
    expect(report?.care[0]?.nextDue).toBe(START + 375 * DAY);
  });

  it('a section left out is empty; a dog that does not exist gives nothing', () => {
    walk(1, 60, 3000);
    const report = buildReport(env.db, options({ sections: ['summary'] }), NOW);
    expect(report?.weeks).toEqual([]);
    expect(report?.situations).toEqual([]);
    expect(report?.summary.walks).toBe(1);
    expect(buildReport(env.db, options({ dogId: 'nobody' }), NOW)).toBeNull();
  });

  it('skills with sessions in the period: the step, the attempts by result; a skill with none is left out', () => {
    const skill = createSkill(env.db, env.ctx, {
      dogId: dog.id,
      name: 'Рядом',
      levels: [{ title: 'Дома' }, { title: 'На улице' }],
    });
    createSkill(env.db, env.ctx, { dogId: dog.id, name: 'Пусто', levels: [{ title: 'Один' }] });
    env.advance(DAY);
    const session = startSession(env.db, env.ctx, dog.id, skill.id);
    addAttempt(env.db, env.ctx, session.id, 'successful');
    addAttempt(env.db, env.ctx, session.id, 'successful');
    addAttempt(env.db, env.ctx, session.id, 'partial');
    addAttempt(env.db, env.ctx, session.id, 'unsuccessful');
    finishSession(env.db, env.ctx, session.id, {});
    const report = buildReport(env.db, options({ toTs: Date.now() + DAY }), Date.now());
    expect(report?.skills).toHaveLength(1);
    expect(report?.skills[0]).toMatchObject({
      name: 'Рядом',
      levelsTotal: 2,
      sessions: 1,
      successful: 2,
      partial: 1,
      unsuccessful: 1,
    });
  });

  it('symptoms of the period (the words of the owner only when asked) and notes of walks', () => {
    const id = walk(5, 40, 1000);
    env.db.run('UPDATE walk SET notes = ? WHERE id = ?', ['много белок', id]);
    env.db.run(
      `INSERT INTO symptom_log (id, dog_id, symptom, other_label, started_at, ended_at, frequency, severity, notes, created_at, updated_at)
       VALUES ('s1', ?, 'vomiting', NULL, ?, ?, 'once', 2, 'после травы', ?, ?)`,
      [
        dog.id,
        new Date(START + 6 * DAY).toISOString(),
        new Date(START + 6 * DAY + 3_600_000).toISOString(),
        new Date(START).toISOString(),
        new Date(START).toISOString(),
      ],
    );
    const quiet = buildReport(env.db, options(), NOW);
    expect(quiet?.symptoms[0]).toMatchObject({
      symptom: 'vomiting',
      frequency: 'once',
      severity: 2,
      notes: null,
    });
    expect(quiet?.symptoms[0]?.endedAt).toBe(START + 6 * DAY + 3_600_000);
    const open = buildReport(env.db, options({ includeNotes: true }), NOW);
    expect(open?.symptoms[0]?.notes).toBe('после травы');
    expect(open?.notes.map((n) => n.source)).toEqual(['walk']);
    expect(open?.notes[0]?.text).toBe('много белок');
  });

  it('care with no next date, and the weeks of a period shorter than a week', () => {
    logCare(env.db, env.ctx, {
      dogId: dog.id,
      kind: 'grooming',
      title: 'Стрижка',
      doneAt: START + DAY,
    });
    const report = buildReport(env.db, options({ toTs: START + 3 * DAY }), NOW);
    expect(report?.care[0]?.nextDue).toBeNull();
    expect(report?.weeks).toHaveLength(1);
  });
});
