import { fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow, SqlValue } from './sql';

export type PhotoOwner = 'walk' | 'event';

export interface Photo {
  readonly id: string;
  readonly ownerTable: PhotoOwner;
  readonly ownerId: string;
  /** Where the copy of the picture lives on the device. */
  readonly uri: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly takenAt: number;
  readonly lat: number | null;
  readonly lon: number | null;
}

export interface PhotoInput {
  readonly uri: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly bytes?: number | null;
  readonly takenAt?: number;
  readonly lat?: number | null;
  readonly lon?: number | null;
}

/** A photo taken within this long of an event belongs to the event (S03-Ph). */
export const PHOTO_EVENT_WINDOW_MS = 90_000;

const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);

function toPhoto(row: SqlRow): Photo {
  const taken = row['taken_at'];
  return {
    id: String(row['id']),
    ownerTable: String(row['owner_table']) as PhotoOwner,
    ownerId: String(row['owner_id']),
    uri: String(row['uri']),
    width: num(row['width']),
    height: num(row['height']),
    bytes: num(row['bytes']),
    takenAt: typeof taken === 'string' ? fromIso(taken) : fromIso(String(row['created_at'])),
    lat: num(row['lat']),
    lon: num(row['lon']),
  };
}

/** Saves a photo of a walk or of one of its events. */
export function addPhoto(
  db: SqlDb,
  ctx: Ctx,
  owner: { readonly table: PhotoOwner; readonly id: string },
  input: PhotoInput,
): Photo {
  if (input.uri.trim() === '') {
    throw new RangeError('A photo needs a place where it is stored');
  }
  const id = ctx.newId();
  db.run(
    `INSERT INTO attachment (id, owner_table, owner_id, uri, width, height, bytes, taken_at, lat, lon, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      owner.table,
      owner.id,
      input.uri,
      input.width ?? null,
      input.height ?? null,
      input.bytes ?? null,
      toIso(input.takenAt ?? ctx.now()),
      input.lat ?? null,
      input.lon ?? null,
      toIso(ctx.now()),
    ],
  );
  const row = db.all('SELECT * FROM attachment WHERE id = ?', [id])[0];
  if (row === undefined) {
    throw new Error('photo was not found right after it was saved');
  }
  return toPhoto(row);
}

/** Photos of one owner, oldest first; removed ones are left out. */
export function listPhotos(db: SqlDb, table: PhotoOwner, ownerId: string): Photo[] {
  return db
    .all(
      'SELECT * FROM attachment WHERE owner_table = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY taken_at, id',
      [table, ownerId],
    )
    .map(toPhoto);
}

/** Every photo of a walk: its own and those of its events, in the order they were taken. */
export function listWalkPhotos(db: SqlDb, walkId: string): Photo[] {
  return db
    .all(
      `SELECT a.* FROM attachment a
        WHERE a.deleted_at IS NULL
          AND ((a.owner_table = 'walk' AND a.owner_id = ?)
            OR (a.owner_table = 'event' AND a.owner_id IN
                 (SELECT id FROM event WHERE walk_id = ? AND deleted_at IS NULL)))
        ORDER BY a.taken_at, a.id`,
      [walkId, walkId],
    )
    .map(toPhoto);
}

/**
 * The event of the walk closest in time to `ts` and no farther than the window, or null: the
 * photo of "the dog we met" belongs to that event, any other photo to the walk. Ties go to the
 * earlier event.
 */
export function nearestEventId(
  db: SqlDb,
  walkId: string,
  ts: number,
  windowMs = PHOTO_EVENT_WINDOW_MS,
): string | null {
  const rows = db.all(
    'SELECT id, ts FROM event WHERE walk_id = ? AND deleted_at IS NULL ORDER BY ts, id',
    [walkId],
  );
  let best: { id: string; distance: number } | null = null;
  for (const row of rows) {
    const distance = Math.abs(fromIso(String(row['ts'])) - ts);
    if (distance <= windowMs && (best === null || distance < best.distance)) {
      best = { id: String(row['id']), distance };
    }
  }
  return best?.id ?? null;
}

/** A photo taken during a walk: attached to the nearest event in time, else to the walk. */
export function addWalkPhoto(db: SqlDb, ctx: Ctx, walkId: string, input: PhotoInput): Photo {
  const eventId = nearestEventId(db, walkId, input.takenAt ?? ctx.now());
  return addPhoto(
    db,
    ctx,
    eventId === null ? { table: 'walk', id: walkId } : { table: 'event', id: eventId },
    input,
  );
}

/** Removes a photo from the app's lists (the file itself is cleaned up later). */
export function removePhoto(db: SqlDb, ctx: Ctx, id: string): boolean {
  return (
    db.run('UPDATE attachment SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [
      toIso(ctx.now()),
      id,
    ]).changes > 0
  );
}

/** The "Undo" of removing a photo. */
export function restorePhoto(db: SqlDb, id: string): boolean {
  return (
    db.run('UPDATE attachment SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id])
      .changes > 0
  );
}
