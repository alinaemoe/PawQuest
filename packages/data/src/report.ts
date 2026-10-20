import { median } from '@pawquest/core';

import { getDog } from './dogs';
import { listEventTypes, type EventType } from './events';
import { fromIso, toIso } from './ids';
import { listSkillSummaries } from './training';
import type { SqlDb, SqlRow, SqlValue } from './sql';

/**
 * Everything the report for a specialist (a trainer, a vet) is made of (docs/23, step 3.21): facts
 * of a period with how many records stand behind each number. No grades, no diagnoses; the owner's
 * own notes only when asked for.
 */

export type ReportSection = 'summary' | 'activity' | 'situations' | 'health' | 'skills' | 'notes';

export const REPORT_SECTIONS: readonly ReportSection[] = [
  'summary',
  'activity',
  'situations',
  'health',
  'skills',
  'notes',
];

export interface ReportOptions {
  readonly dogId: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly sections: readonly ReportSection[];
  /** The owner's free text (notes of events, walks, the diary) goes in only if this is true. */
  readonly includeNotes: boolean;
}

const WEEK_MS = 7 * 86_400_000;
export const MAX_SITUATIONS = 5;
export const MAX_EXAMPLES = 3;
export const MAX_NOTES = 12;

export interface ReportDog {
  readonly name: string;
  readonly breed: string | null;
  readonly sex: string | null;
  readonly size: string | null;
  readonly birthDate: string | null;
  readonly approxAgeMonths: number | null;
}

export interface ReportSummary {
  readonly walks: number;
  readonly distanceM: number;
  readonly durationS: number;
  readonly activeDays: number;
  readonly events: number;
  readonly triggers: number;
  /** Triggers per hour of the walks of the period; null when the walks are too short in all. */
  readonly triggersPerHour: number | null;
  /** The median time to calm down after a trigger, in seconds, and how many records it rests on. */
  readonly recoveryMedianS: number | null;
  readonly recoveryN: number;
}

export interface ReportWeek {
  /** The start of the 7-day bucket, ms. */
  readonly fromTs: number;
  readonly walks: number;
  readonly distanceM: number;
  readonly durationS: number;
  readonly triggers: number;
}

export interface ReportSituation {
  readonly typeId: string;
  readonly count: number;
  readonly reactionMean: number | null;
  readonly reactionN: number;
  readonly far: number;
  readonly mid: number;
  readonly near: number;
  readonly recoveryMedianS: number | null;
  readonly recoveryN: number;
  readonly lastTs: number;
}

export interface ReportExample {
  readonly ts: number;
  readonly typeId: string;
  readonly placeName: string | null;
  /** The owner's own words: only with `includeNotes`. */
  readonly note: string | null;
}

export interface ReportWeight {
  readonly at: number;
  readonly grams: number;
}

export interface ReportCare {
  readonly kind: string;
  readonly title: string;
  readonly product: string | null;
  readonly doneAt: number;
  readonly nextDue: number | null;
}

export interface ReportSymptom {
  readonly symptom: string;
  readonly otherLabel: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly frequency: string | null;
  readonly severity: number | null;
  readonly notes: string | null;
}

export interface ReportSkill {
  readonly name: string;
  readonly levelTitle: string | null;
  readonly levelPosition: number | null;
  readonly levelsTotal: number;
  readonly sessions: number;
  readonly successful: number;
  readonly partial: number;
  readonly unsuccessful: number;
}

export interface ReportNote {
  readonly ts: number;
  readonly source: 'event' | 'walk';
  readonly typeId: string | null;
  readonly text: string;
}

export interface ReportData {
  readonly dog: ReportDog;
  readonly fromTs: number;
  readonly toTs: number;
  readonly generatedAt: number;
  readonly sections: readonly ReportSection[];
  readonly includeNotes: boolean;
  readonly types: readonly EventType[];
  readonly summary: ReportSummary;
  readonly weeks: readonly ReportWeek[];
  readonly situations: readonly ReportSituation[];
  readonly examples: readonly ReportExample[];
  readonly weights: readonly ReportWeight[];
  readonly care: readonly ReportCare[];
  readonly symptoms: readonly ReportSymptom[];
  readonly skills: readonly ReportSkill[];
  readonly notes: readonly ReportNote[];
}

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);
const count = (row: SqlRow | undefined, key = 'n'): number => Number(row?.[key] ?? 0);

/** Walks shorter than this do not count in a rate per hour (ten minutes is not a sample of an hour). */
const MIN_RATE_TOTAL_S = 3600;

function summaryOf(db: SqlDb, o: ReportOptions): ReportSummary {
  const from = toIso(o.fromTs);
  const to = toIso(o.toTs);
  const walks = db.all(
    `SELECT COUNT(*) AS n, COALESCE(SUM(w.distance_m), 0) AS d, COALESCE(SUM(w.duration_s), 0) AS t,
            COUNT(DISTINCT substr(w.started_at, 1, 10)) AS days
       FROM walk w JOIN walk_dog k ON k.walk_id = w.id
      WHERE k.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND w.started_at >= ? AND w.started_at < ?`,
    [o.dogId, from, to],
  )[0];
  const events = db.all(
    `SELECT t.kind AS kind, e.recovery_s AS rec
       FROM event e JOIN event_type t ON t.id = e.type_id
      WHERE e.dog_id = ? AND e.deleted_at IS NULL AND e.ts >= ? AND e.ts < ?`,
    [o.dogId, from, to],
  );
  const triggers = events.filter((r) => r['kind'] === 'trigger');
  const recoveries = triggers.flatMap((r) => num(r['rec']) ?? []);
  const durationS = count(walks, 't');
  return {
    walks: count(walks),
    distanceM: Math.round(count(walks, 'd')),
    durationS,
    activeDays: count(walks, 'days'),
    events: events.length,
    triggers: triggers.length,
    triggersPerHour: durationS >= MIN_RATE_TOTAL_S ? (triggers.length * 3600) / durationS : null,
    recoveryMedianS: recoveries.length === 0 ? null : median(recoveries),
    recoveryN: recoveries.length,
  };
}

function weeksOf(db: SqlDb, o: ReportOptions): ReportWeek[] {
  const total = Math.max(1, Math.ceil((o.toTs - o.fromTs) / WEEK_MS));
  // the newest bucket ends at the end of the period, so the last bar is always a full week
  const buckets = Array.from({ length: total }, (_, i) => ({
    fromTs: o.toTs - (total - i) * WEEK_MS,
    walks: 0,
    distanceM: 0,
    durationS: 0,
    triggers: 0,
  }));
  const index = (ts: number): number => total - 1 - Math.floor((o.toTs - 1 - ts) / WEEK_MS);
  for (const r of db.all(
    `SELECT w.started_at AS at, w.distance_m AS d, w.duration_s AS t
       FROM walk w JOIN walk_dog k ON k.walk_id = w.id
      WHERE k.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
        AND w.started_at >= ? AND w.started_at < ?`,
    [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
  )) {
    const b = buckets[index(fromIso(String(r['at'])))];
    if (b !== undefined) {
      b.walks += 1;
      b.distanceM += num(r['d']) ?? 0;
      b.durationS += num(r['t']) ?? 0;
    }
  }
  for (const r of db.all(
    `SELECT e.ts AS at FROM event e JOIN event_type t ON t.id = e.type_id
      WHERE e.dog_id = ? AND e.deleted_at IS NULL AND t.kind = 'trigger' AND e.ts >= ? AND e.ts < ?`,
    [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
  )) {
    const b = buckets[index(fromIso(String(r['at'])))];
    if (b !== undefined) {
      b.triggers += 1;
    }
  }
  return buckets.map((b) => ({ ...b, distanceM: Math.round(b.distanceM) }));
}

function situationsOf(db: SqlDb, o: ReportOptions): ReportSituation[] {
  const rows = db.all(
    `SELECT e.type_id AS type, e.ts AS at, e.reaction AS reaction, e.distance_bucket AS bucket,
            e.recovery_s AS rec
       FROM event e JOIN event_type t ON t.id = e.type_id
      WHERE e.dog_id = ? AND e.deleted_at IS NULL AND t.kind = 'trigger'
        AND e.ts >= ? AND e.ts < ?`,
    [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
  );
  const groups = new Map<string, SqlRow[]>();
  for (const r of rows) {
    const key = String(r['type']);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([typeId, list]): ReportSituation => {
      const reactions = list.flatMap((r) => num(r['reaction']) ?? []);
      const recoveries = list.flatMap((r) => num(r['rec']) ?? []);
      return {
        typeId,
        count: list.length,
        reactionMean:
          reactions.length === 0 ? null : reactions.reduce((a, b) => a + b, 0) / reactions.length,
        reactionN: reactions.length,
        far: list.filter((r) => r['bucket'] === 'far').length,
        mid: list.filter((r) => r['bucket'] === 'mid').length,
        near: list.filter((r) => r['bucket'] === 'near').length,
        recoveryMedianS: recoveries.length === 0 ? null : median(recoveries),
        recoveryN: recoveries.length,
        lastTs: Math.max(...list.map((r) => fromIso(String(r['at'])))),
      };
    })
    .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
    .slice(0, MAX_SITUATIONS);
}

function examplesOf(db: SqlDb, o: ReportOptions): ReportExample[] {
  return db
    .all(
      `SELECT e.ts AS at, e.type_id AS type, e.note AS note, p.name AS place
         FROM event e
         JOIN event_type t ON t.id = e.type_id
         LEFT JOIN walk w ON w.id = e.walk_id
         LEFT JOIN place p ON p.id = COALESCE(e.place_id, w.place_id)
        WHERE e.dog_id = ? AND e.deleted_at IS NULL AND t.kind = 'trigger'
          AND e.ts >= ? AND e.ts < ?
        ORDER BY e.ts DESC LIMIT ?`,
      [o.dogId, toIso(o.fromTs), toIso(o.toTs), MAX_EXAMPLES],
    )
    .map((r) => ({
      ts: fromIso(String(r['at'])),
      typeId: String(r['type']),
      placeName: str(r['place']),
      note: o.includeNotes ? str(r['note']) : null,
    }));
}

function weightsOf(db: SqlDb, o: ReportOptions): ReportWeight[] {
  // the last weighing before the period is the start line of the chart
  const before = db.all(
    `SELECT measured_at AS at, weight_g AS g FROM weight_log
      WHERE dog_id = ? AND deleted_at IS NULL AND measured_at < ?
      ORDER BY measured_at DESC LIMIT 1`,
    [o.dogId, toIso(o.fromTs)],
  );
  const within = db.all(
    `SELECT measured_at AS at, weight_g AS g FROM weight_log
      WHERE dog_id = ? AND deleted_at IS NULL AND measured_at >= ? AND measured_at < ?
      ORDER BY measured_at`,
    [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
  );
  return [...before, ...within].map((r) => ({
    at: fromIso(String(r['at'])),
    grams: Number(r['g']),
  }));
}

function careOf(db: SqlDb, o: ReportOptions): ReportCare[] {
  return db
    .all(
      `SELECT kind, title, product, done_at, next_due FROM care_item
        WHERE dog_id = ? AND deleted_at IS NULL AND done_at IS NOT NULL
          AND done_at >= ? AND done_at < ?
        ORDER BY done_at DESC`,
      [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
    )
    .map((r) => {
      const due = str(r['next_due']);
      return {
        kind: String(r['kind']),
        title: String(r['title']),
        product: str(r['product']),
        doneAt: fromIso(String(r['done_at'])),
        nextDue: due === null ? null : fromIso(due),
      };
    });
}

function symptomsOf(db: SqlDb, o: ReportOptions): ReportSymptom[] {
  return db
    .all(
      `SELECT symptom, other_label, started_at, ended_at, frequency, severity, notes
         FROM symptom_log
        WHERE dog_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ?
        ORDER BY started_at DESC`,
      [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
    )
    .map((r) => {
      const ended = str(r['ended_at']);
      return {
        symptom: String(r['symptom']),
        otherLabel: str(r['other_label']),
        startedAt: fromIso(String(r['started_at'])),
        endedAt: ended === null ? null : fromIso(ended),
        frequency: str(r['frequency']),
        severity: num(r['severity']),
        notes: o.includeNotes ? str(r['notes']) : null,
      };
    });
}

function skillsOf(db: SqlDb, o: ReportOptions): ReportSkill[] {
  return listSkillSummaries(db, o.dogId)
    .map((skill): ReportSkill => {
      const sessions = db.all(
        `SELECT COUNT(*) AS n FROM training_session
          WHERE skill_id = ? AND deleted_at IS NULL AND duration_s IS NOT NULL
            AND started_at >= ? AND started_at < ?`,
        [skill.id, toIso(o.fromTs), toIso(o.toTs)],
      )[0];
      const attempts = db.all(
        `SELECT a.result AS result, COUNT(*) AS n
           FROM training_attempt a JOIN training_session s ON s.id = a.session_id
          WHERE s.skill_id = ? AND s.deleted_at IS NULL AND s.started_at >= ? AND s.started_at < ?
          GROUP BY a.result`,
        [skill.id, toIso(o.fromTs), toIso(o.toTs)],
      );
      const of = (result: string): number =>
        count(
          attempts.find((r) => r['result'] === result),
          'n',
        );
      return {
        name: skill.name,
        levelTitle: skill.currentLevel?.title ?? null,
        levelPosition: skill.currentLevel?.position ?? null,
        levelsTotal: skill.levels.length,
        sessions: count(sessions),
        successful: of('successful'),
        partial: of('partial'),
        unsuccessful: of('unsuccessful'),
      };
    })
    .filter((s) => s.sessions > 0);
}

function notesOf(db: SqlDb, o: ReportOptions): ReportNote[] {
  if (!o.includeNotes) {
    return [];
  }
  const events = db
    .all(
      `SELECT ts, type_id, note FROM event
        WHERE dog_id = ? AND deleted_at IS NULL AND note IS NOT NULL AND trim(note) <> ''
          AND ts >= ? AND ts < ?`,
      [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
    )
    .map((r): ReportNote => ({
      ts: fromIso(String(r['ts'])),
      source: 'event',
      typeId: String(r['type_id']),
      text: String(r['note']).trim(),
    }));
  const walks = db
    .all(
      `SELECT w.started_at AS ts, w.notes AS note
         FROM walk w JOIN walk_dog k ON k.walk_id = w.id
        WHERE k.dog_id = ? AND w.deleted_at IS NULL AND w.notes IS NOT NULL AND trim(w.notes) <> ''
          AND w.started_at >= ? AND w.started_at < ?`,
      [o.dogId, toIso(o.fromTs), toIso(o.toTs)],
    )
    .map((r): ReportNote => ({
      ts: fromIso(String(r['ts'])),
      source: 'walk',
      typeId: null,
      text: String(r['note']).trim(),
    }));
  return [...events, ...walks].sort((a, b) => b.ts - a.ts).slice(0, MAX_NOTES);
}

/** Gathers what the report says; a section the owner left out is empty, not hidden in the data. */
export function buildReport(db: SqlDb, o: ReportOptions, now: number): ReportData | null {
  const dog = getDog(db, o.dogId);
  if (dog === null) {
    return null;
  }
  const has = (section: ReportSection): boolean => o.sections.includes(section);
  return {
    dog: {
      name: dog.name,
      breed: dog.breed ?? null,
      sex: dog.sex ?? null,
      size: dog.size ?? null,
      birthDate: dog.birthDate ?? null,
      approxAgeMonths: dog.approxAgeMonths ?? null,
    },
    fromTs: o.fromTs,
    toTs: o.toTs,
    generatedAt: now,
    sections: o.sections,
    includeNotes: o.includeNotes,
    types: listEventTypes(db, true),
    summary: summaryOf(db, o),
    weeks: has('activity') ? weeksOf(db, o) : [],
    situations: has('situations') ? situationsOf(db, o) : [],
    examples: has('situations') ? examplesOf(db, o) : [],
    weights: has('health') ? weightsOf(db, o) : [],
    care: has('health') ? careOf(db, o) : [],
    symptoms: has('health') ? symptomsOf(db, o) : [],
    skills: has('skills') ? skillsOf(db, o) : [],
    notes: has('notes') ? notesOf(db, o) : [],
  };
}
