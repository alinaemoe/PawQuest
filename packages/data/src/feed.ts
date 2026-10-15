import { fromIso, toIso } from './ids';
import type { SqlDb, SqlRow } from './sql';

/** Year 2223: later than any record the app can hold. */
const FAR_FUTURE = 8_000_000_000_000;

/** One line of the "recent" feed on Today (S01-T). */
export type FeedItem =
  | {
      readonly kind: 'walk';
      readonly id: string;
      readonly ts: number;
      readonly durationS: number | null;
      readonly distanceM: number | null;
    }
  | {
      readonly kind: 'session';
      readonly id: string;
      readonly ts: number;
      readonly skillName: string;
      readonly attempts: number;
    }
  | {
      readonly kind: 'event';
      readonly id: string;
      readonly ts: number;
      readonly typeId: string;
      readonly note: string | null;
    }
  | { readonly kind: 'symptom'; readonly id: string; readonly ts: number; readonly symptom: string }
  | { readonly kind: 'weight'; readonly id: string; readonly ts: number; readonly weightG: number };

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toItem(row: SqlRow): FeedItem {
  const base = { id: String(row['id']), ts: fromIso(String(row['ts'])) };
  switch (String(row['kind'])) {
    case 'walk':
      return { kind: 'walk', ...base, durationS: num(row['n1']), distanceM: num(row['n2']) };
    case 'session':
      return {
        kind: 'session',
        ...base,
        skillName: str(row['s1']) ?? '',
        attempts: num(row['n1']) ?? 0,
      };
    case 'event':
      return { kind: 'event', ...base, typeId: str(row['s1']) ?? '', note: str(row['s2']) };
    case 'symptom':
      return { kind: 'symptom', ...base, symptom: str(row['s1']) ?? '' };
    default:
      return { kind: 'weight', ...base, weightG: num(row['n1']) ?? 0 };
  }
}

/**
 * The newest records of a dog across walks, training sessions, observations made outside a walk,
 * symptoms and weighings (deleted ones excluded). `before` pages backwards in time.
 */
export function recentFeed(
  db: SqlDb,
  dogId: string,
  limit: number,
  before: number = FAR_FUTURE,
): FeedItem[] {
  const rows = db.all(
    `SELECT * FROM (
       SELECT 'walk' AS kind, w.id AS id, w.started_at AS ts, w.duration_s AS n1, w.distance_m AS n2, NULL AS s1, NULL AS s2
         FROM walk w JOIN walk_dog d ON d.walk_id = w.id
         WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
       UNION ALL
       SELECT 'session', t.id, t.started_at, (SELECT COUNT(*) FROM training_attempt a WHERE a.session_id = t.id), NULL, s.name, NULL
         FROM training_session t JOIN skill s ON s.id = t.skill_id
         WHERE t.dog_id = ? AND t.deleted_at IS NULL
       UNION ALL
       SELECT 'event', e.id, e.ts, NULL, NULL, e.type_id, e.note
         FROM event e WHERE e.dog_id = ? AND e.walk_id IS NULL AND e.deleted_at IS NULL
       UNION ALL
       SELECT 'symptom', y.id, y.started_at, NULL, NULL, y.symptom, NULL
         FROM symptom_log y WHERE y.dog_id = ? AND y.deleted_at IS NULL
       UNION ALL
       SELECT 'weight', g.id, g.measured_at, g.weight_g, NULL, NULL, NULL
         FROM weight_log g WHERE g.dog_id = ? AND g.deleted_at IS NULL
     ) WHERE ts < ? ORDER BY ts DESC, id DESC LIMIT ?`,
    [dogId, dogId, dogId, dogId, dogId, toIso(before), limit],
  );
  return rows.map(toItem);
}
