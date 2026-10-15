import { eventFromRow, type BehaviorEvent, type DistanceBucket } from './events';
import { toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow } from './sql';

export type Outcome = 'calmed_fast' | 'took_time' | 'ongoing' | 'unknown';

/** The ABC details of an observation (spec S12-F): what came before, the behavior, what followed. */
export interface EventDetail {
  readonly antecedent: string | null;
  readonly behaviors: readonly string[];
  readonly ownerActions: readonly string[];
  readonly outcome: Outcome | null;
  readonly consequenceNote: string | null;
  /** The owner's own explanation, kept apart from the facts. */
  readonly interpretation: string | null;
}

export const EMPTY_DETAIL: EventDetail = {
  antecedent: null,
  behaviors: [],
  ownerActions: [],
  outcome: null,
  consequenceNote: null,
  interpretation: null,
};

function parseList(text: unknown): string[] {
  if (typeof text !== 'string') {
    return [];
  }
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function getEventDetail(db: SqlDb, eventId: string): EventDetail {
  const row = db.all('SELECT * FROM event_detail WHERE event_id = ?', [eventId])[0];
  if (row === undefined) {
    return EMPTY_DETAIL;
  }
  return {
    antecedent: str(row['antecedent']),
    behaviors: parseList(row['behaviors']),
    ownerActions: parseList(row['owner_actions']),
    outcome: str(row['outcome']) as Outcome | null,
    consequenceNote: str(row['consequence_note']),
    interpretation: str(row['interpretation']),
  };
}

export function saveEventDetail(db: SqlDb, ctx: Ctx, eventId: string, detail: EventDetail): void {
  db.run(
    `INSERT INTO event_detail
       (event_id, antecedent, behaviors, owner_actions, outcome, consequence_note, interpretation, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       antecedent = excluded.antecedent, behaviors = excluded.behaviors,
       owner_actions = excluded.owner_actions, outcome = excluded.outcome,
       consequence_note = excluded.consequence_note, interpretation = excluded.interpretation,
       updated_at = excluded.updated_at`,
    [
      eventId,
      detail.antecedent,
      JSON.stringify(detail.behaviors),
      JSON.stringify(detail.ownerActions),
      detail.outcome,
      detail.consequenceNote,
      detail.interpretation,
      toIso(ctx.now()),
    ],
  );
}

export interface EventChanges {
  readonly typeId?: string;
  readonly ts?: number;
  readonly note?: string | null;
  readonly distanceBucket?: DistanceBucket | null;
  readonly reaction?: number | null;
  readonly distraction?: number | null;
  readonly recoveryS?: number | null;
  readonly incomplete?: boolean;
}

/** Edits an observation; returns false when it does not exist or is deleted. */
export function updateEvent(db: SqlDb, ctx: Ctx, id: string, changes: EventChanges): boolean {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (column: string, value: string | number | null | undefined): void => {
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(value);
    }
  };
  set('type_id', changes.typeId);
  set('ts', changes.ts === undefined ? undefined : toIso(changes.ts));
  set('note', changes.note);
  set('distance_bucket', changes.distanceBucket);
  set('reaction', changes.reaction);
  set('distraction', changes.distraction);
  set('recovery_s', changes.recoveryS);
  set('incomplete', changes.incomplete === undefined ? undefined : changes.incomplete ? 1 : 0);
  if (sets.length === 0) {
    return db.all('SELECT 1 FROM event WHERE id = ? AND deleted_at IS NULL', [id]).length > 0;
  }
  return (
    db.run(
      `UPDATE event SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [...params, toIso(ctx.now()), id],
    ).changes > 0
  );
}

export interface DiaryFilter {
  readonly onlyIncomplete?: boolean;
  /** Page backwards: events strictly older than this moment. */
  readonly before?: number;
}

export interface DiaryEntry {
  readonly event: BehaviorEvent;
  readonly detail: EventDetail;
}

function toEntry(row: SqlRow, db: SqlDb): DiaryEntry {
  const event = eventFromRow(row);
  return { event, detail: getEventDetail(db, event.id) };
}

/** The behavior diary of a dog, newest first (spec S12-L). */
export function listDiary(
  db: SqlDb,
  dogId: string,
  limit: number,
  filter: DiaryFilter = {},
): DiaryEntry[] {
  return db
    .all(
      `SELECT * FROM event
        WHERE dog_id = ? AND deleted_at IS NULL AND ts < ?
          AND (? = 0 OR (incomplete = 1 AND type_id NOT IN ('toilet', 'note')))
        ORDER BY ts DESC, id DESC LIMIT ?`,
      [
        dogId,
        toIso(filter.before ?? 8_000_000_000_000),
        filter.onlyIncomplete === true ? 1 : 0,
        limit,
      ],
    )
    .map((row) => toEntry(row, db));
}

export const DETAIL_FIELD_COUNT = 8;

/**
 * How many of the eight detail fields are filled (distance, reaction, distraction, behavior, what
 * the owner did, outcome, note, the owner's thought). Shown as "filled 3 of 8" (S04).
 */
export function filledFields(
  event: Pick<BehaviorEvent, 'distanceBucket' | 'reaction' | 'note' | 'distraction'>,
  detail: EventDetail,
): number {
  const flags = [
    event.distanceBucket !== null,
    event.reaction !== null,
    event.distraction !== null,
    detail.behaviors.length > 0,
    detail.ownerActions.length > 0,
    detail.outcome !== null,
    event.note !== null,
    detail.interpretation !== null,
  ];
  return flags.filter(Boolean).length;
}
