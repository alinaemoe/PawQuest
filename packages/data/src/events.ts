import { expectFound, fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow, SqlValue } from './sql';

export type EventKind = 'trigger' | 'outcome' | 'action' | 'physio' | 'note';
export type DistanceBucket = 'far' | 'mid' | 'near';

export interface EventType {
  readonly id: string;
  /** i18n key for built-in types, null for custom ones. */
  readonly labelKey: string | null;
  /** User-given name for custom types. */
  readonly label: string | null;
  readonly kind: EventKind;
  /** Color token (`dog`, `ok`, ...) the UI maps to the theme's event colors. */
  readonly color: string;
  readonly icon: string;
  readonly startsRecoveryTimer: boolean;
  /** Position on the 3x3 quick-event panel, null when only in the catalog. */
  readonly slot: number | null;
  readonly builtin: boolean;
  readonly archived: boolean;
}

export interface BehaviorEvent {
  readonly id: string;
  readonly dogId: string;
  readonly walkId: string | null;
  readonly typeId: string;
  readonly ts: number;
  readonly note: string | null;
  readonly distanceBucket: DistanceBucket | null;
  readonly reaction: number | null;
  /** True while the observation still lacks details ("можно дополнить"). */
  readonly incomplete: boolean;
}

export interface EventInput {
  readonly dogId: string;
  readonly typeId: string;
  readonly ts?: number;
  readonly tzOffsetMin?: number;
  readonly walkId?: string | null;
  readonly note?: string | null;
  readonly lat?: number | null;
  readonly lon?: number | null;
  readonly distanceM?: number | null;
  readonly distanceBucket?: DistanceBucket | null;
  readonly reaction?: number | null;
  readonly distraction?: number | null;
  readonly recoveryS?: number | null;
  readonly skillId?: string | null;
  /** Default true: a bare tap records "something happened" and can be completed later. */
  readonly incomplete?: boolean;
  readonly isDemo?: boolean;
}

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);

function toEventType(row: SqlRow): EventType {
  return {
    id: String(row['id']),
    labelKey: str(row['label_key']),
    label: str(row['label']),
    kind: String(row['kind']) as EventKind,
    color: String(row['color']),
    icon: String(row['icon']),
    startsRecoveryTimer: row['starts_recovery_timer'] === 1,
    slot: num(row['slot']),
    builtin: row['builtin'] === 1,
    archived: row['archived'] === 1,
  };
}

function toEvent(row: SqlRow): BehaviorEvent {
  return {
    id: String(row['id']),
    dogId: String(row['dog_id']),
    walkId: str(row['walk_id']),
    typeId: String(row['type_id']),
    ts: fromIso(String(row['ts'])),
    note: str(row['note']),
    distanceBucket: str(row['distance_bucket']) as DistanceBucket | null,
    reaction: num(row['reaction']),
    incomplete: row['incomplete'] === 1,
  };
}

/** All non-archived event types in catalog order. */
export function listEventTypes(db: SqlDb): EventType[] {
  return db
    .all('SELECT * FROM event_type WHERE archived = 0 ORDER BY sort_order, id')
    .map(toEventType);
}

/** The types on the quick-event panel (S03-E), by slot. */
export function panelEventTypes(db: SqlDb): EventType[] {
  return db
    .all('SELECT * FROM event_type WHERE archived = 0 AND slot IS NOT NULL ORDER BY slot')
    .map(toEventType);
}

export function createEvent(db: SqlDb, ctx: Ctx, input: EventInput): BehaviorEvent {
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO event
       (id, dog_id, walk_id, type_id, ts, tz_offset_min, lat, lon, distance_m, distance_bucket,
        reaction, distraction, recovery_s, skill_id, note, incomplete, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.dogId,
      input.walkId ?? null,
      input.typeId,
      toIso(input.ts ?? ctx.now()),
      input.tzOffsetMin ?? 0,
      input.lat ?? null,
      input.lon ?? null,
      input.distanceM ?? null,
      input.distanceBucket ?? null,
      input.reaction ?? null,
      input.distraction ?? null,
      input.recoveryS ?? null,
      input.skillId ?? null,
      input.note ?? null,
      input.incomplete === false ? 0 : 1,
      input.isDemo === true ? 1 : 0,
      nowIso,
      nowIso,
    ],
  );
  return expectFound(getEvent(db, id), 'event');
}

export function getEvent(db: SqlDb, id: string): BehaviorEvent | null {
  const row = db.all('SELECT * FROM event WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toEvent(row);
}

/** Events of a dog between two moments (inclusive start, exclusive end), newest first. */
export function listEvents(
  db: SqlDb,
  dogId: string,
  fromTs: number,
  toTs: number,
): BehaviorEvent[] {
  return db
    .all(
      'SELECT * FROM event WHERE dog_id = ? AND deleted_at IS NULL AND ts >= ? AND ts < ? ORDER BY ts DESC, id DESC',
      [dogId, toIso(fromTs), toIso(toTs)],
    )
    .map(toEvent);
}

/** Count of events still marked "можно дополнить" (badge of the diary, S12). */
export function countIncompleteEvents(db: SqlDb, dogId: string): number {
  const row = db.all(
    "SELECT COUNT(*) AS n FROM event WHERE dog_id = ? AND deleted_at IS NULL AND incomplete = 1 AND type_id NOT IN ('toilet', 'note')",
    [dogId],
  )[0];
  return Number(row?.['n'] ?? 0);
}
