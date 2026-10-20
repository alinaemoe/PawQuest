import type { ReportData } from '@pawquest/data';

/** A made-up report for tests and for looking at the design (never shown to the owner). */
export const DAY = 86_400_000;
export const SAMPLE_NOW = Date.UTC(2026, 9, 20, 10, 0, 0);

const types = [
  {
    id: 'dog',
    labelKey: 'event.dog',
    label: null,
    kind: 'trigger',
    color: '#000',
    icon: 'dog',
    startsRecoveryTimer: true,
    slot: null,
    builtin: true,
    archived: false,
  },
] as unknown as ReportData['types'];

export function sampleReport(extra: Partial<ReportData> = {}): ReportData {
  return {
    dog: {
      name: 'Фрэнни <3',
      breed: 'Лабрадор',
      sex: 'female',
      size: 'large',
      birthDate: '2023-08-20',
      approxAgeMonths: null,
    },
    fromTs: SAMPLE_NOW - 90 * DAY,
    toTs: SAMPLE_NOW,
    generatedAt: SAMPLE_NOW,
    sections: ['summary', 'activity', 'situations', 'health', 'skills', 'notes'],
    includeNotes: true,
    types,
    summary: {
      walks: 40,
      distanceM: 96_000,
      durationS: 150_000,
      activeDays: 38,
      events: 61,
      triggers: 34,
      triggersPerHour: 0.8,
      recoveryMedianS: 95,
      recoveryN: 22,
    },
    weeks: Array.from({ length: 4 }, (_, i) => ({
      fromTs: SAMPLE_NOW - (4 - i) * 7 * DAY,
      walks: 3 + i,
      distanceM: 9000,
      durationS: 10_000 * (i + 1),
      triggers: i * 2,
    })),
    situations: [
      {
        typeId: 'dog',
        count: 12,
        reactionMean: 3.4,
        reactionN: 10,
        far: 3,
        mid: 4,
        near: 5,
        recoveryMedianS: 120,
        recoveryN: 9,
        lastTs: SAMPLE_NOW - DAY,
      },
    ],
    examples: [
      { ts: SAMPLE_NOW - DAY, typeId: 'dog', placeName: 'Парк', note: 'тянула <к собаке>' },
    ],
    weights: [
      { at: SAMPLE_NOW - 80 * DAY, grams: 24_000 },
      { at: SAMPLE_NOW - 10 * DAY, grams: 25_200 },
    ],
    care: [
      {
        kind: 'vaccination',
        title: 'Комплексная',
        product: 'Нобивак',
        doneAt: SAMPLE_NOW - 30 * DAY,
        nextDue: SAMPLE_NOW + 335 * DAY,
      },
    ],
    symptoms: [
      {
        symptom: 'vomiting',
        otherLabel: null,
        startedAt: SAMPLE_NOW - 20 * DAY,
        endedAt: null,
        frequency: 'several',
        severity: 2,
        notes: null,
      },
    ],
    skills: [
      {
        name: 'Рядом',
        levelTitle: 'С отвлечениями',
        levelPosition: 3,
        levelsTotal: 6,
        sessions: 7,
        successful: 20,
        partial: 5,
        unsuccessful: 2,
      },
      {
        name: 'Дай лапу',
        levelTitle: null,
        levelPosition: null,
        levelsTotal: 0,
        sessions: 2,
        successful: 0,
        partial: 0,
        unsuccessful: 0,
      },
    ],
    notes: [
      { ts: SAMPLE_NOW - 2 * DAY, source: 'event', typeId: 'dog', text: 'Говорил "привет"' },
      { ts: SAMPLE_NOW - 3 * DAY, source: 'walk', typeId: null, text: 'Долго нюхала' },
    ],
    ...extra,
  };
}
