import { expectFound, toIso, type Ctx } from './ids';
import { listEventTypes, type EventKind, type EventType } from './events';
import type { SqlDb } from './sql';

/** The quick-event panel is a 3x3 grid (spec S03-E). */
export const PANEL_SLOTS = 9;
/** What a new install shows: the six built-in marks of docs/04. */
export const DEFAULT_PANEL = ['dog', 'person', 'child', 'animal', 'success', 'hard'] as const;
/** The looks a mark can have: a color and a shape that the theme knows (docs/03 G-12). */
export const MARK_LOOKS = ['dog', 'person', 'animal', 'child', 'ok', 'hard', 'ex'] as const;
export type MarkLook = (typeof MARK_LOOKS)[number];
export const MAX_MARK_LABEL = 24;

function tidyLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MARK_LABEL);
}

function allIds(db: SqlDb): Set<string> {
  return new Set(listEventTypes(db).map((t) => t.id));
}

/**
 * Puts exactly these types on the panel, in this order (slot 0, 1, 2, ...); every other type goes
 * back to the catalog. At most nine, no repeats, only types that exist and are not archived.
 */
export function setPanelOrder(db: SqlDb, ctx: Ctx, typeIds: readonly string[]): void {
  if (typeIds.length > PANEL_SLOTS) {
    throw new RangeError(`The panel holds at most ${String(PANEL_SLOTS)} marks`);
  }
  if (new Set(typeIds).size !== typeIds.length) {
    throw new RangeError('A mark can be on the panel only once');
  }
  const known = allIds(db);
  for (const id of typeIds) {
    if (!known.has(id)) {
      throw new RangeError(`Unknown or archived mark: ${id}`);
    }
  }
  const nowIso = toIso(ctx.now());
  db.transaction(() => {
    db.run('UPDATE event_type SET slot = NULL, updated_at = ? WHERE slot IS NOT NULL', [nowIso]);
    typeIds.forEach((id, slot) => {
      db.run('UPDATE event_type SET slot = ?, updated_at = ? WHERE id = ?', [slot, nowIso, id]);
    });
  });
}

/** Back to the default six marks. */
export function resetPanel(db: SqlDb, ctx: Ctx): void {
  setPanelOrder(db, ctx, DEFAULT_PANEL);
}

export interface CustomMarkInput {
  /** The name shown on the button; tidied and cut to 24 characters. */
  readonly label: string;
  readonly look: MarkLook;
  readonly kind?: EventKind;
  /** Put it on the first free slot of the panel, when there is one. */
  readonly onPanel?: boolean;
}

/** Adds an owner's own mark ("Лужа", "Электросамокат"). Returns it; the panel is full -> catalog only. */
export function createCustomMark(db: SqlDb, ctx: Ctx, input: CustomMarkInput): EventType {
  const label = tidyLabel(input.label);
  if (label === '') {
    throw new RangeError('A mark needs a name');
  }
  if (!MARK_LOOKS.includes(input.look)) {
    throw new RangeError(`Unknown look: ${input.look}`);
  }
  const taken = new Set(
    db
      .all('SELECT slot FROM event_type WHERE slot IS NOT NULL AND archived = 0')
      .map((r) => Number(r['slot'])),
  );
  let slot: number | null = null;
  if (input.onPanel === true) {
    for (let candidate = 0; candidate < PANEL_SLOTS; candidate++) {
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
  }
  const order = Number(
    db.all('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM event_type')[0]?.['n'],
  );
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO event_type
       (id, label_key, label, kind, color, icon, starts_recovery_timer, slot, sort_order, builtin, archived, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?, 0, 0, ?, ?)`,
    [id, label, input.kind ?? 'trigger', input.look, input.look, slot, order, nowIso, nowIso],
  );
  return expectFound(listEventTypes(db).find((t) => t.id === id) ?? null, 'event type');
}

export interface MarkChanges {
  /** Only custom marks can be renamed (built-in names come from the language files). */
  readonly label?: string;
  readonly look?: MarkLook;
}

/** Renames a custom mark or changes the look of any mark. Returns false when it does not exist. */
export function updateMark(db: SqlDb, ctx: Ctx, id: string, changes: MarkChanges): boolean {
  const type = listEventTypes(db).find((t) => t.id === id);
  if (type === undefined) {
    return false;
  }
  const label = changes.label === undefined ? null : tidyLabel(changes.label);
  if (changes.label !== undefined && !type.builtin && label === '') {
    throw new RangeError('A mark needs a name');
  }
  if (changes.look !== undefined && !MARK_LOOKS.includes(changes.look)) {
    throw new RangeError(`Unknown look: ${changes.look}`);
  }
  db.run('UPDATE event_type SET label = ?, color = ?, updated_at = ? WHERE id = ?', [
    type.builtin || label === null ? type.label : label,
    changes.look ?? type.color,
    toIso(ctx.now()),
    id,
  ]);
  return true;
}

/**
 * Removes a custom mark from the app. The events recorded with it stay and keep showing its name;
 * built-in marks cannot be removed (they can only leave the panel). Returns false for a built-in
 * or a missing mark.
 */
export function archiveCustomMark(db: SqlDb, ctx: Ctx, id: string): boolean {
  return (
    db.run(
      'UPDATE event_type SET archived = 1, slot = NULL, updated_at = ? WHERE id = ? AND builtin = 0 AND archived = 0',
      [toIso(ctx.now()), id],
    ).changes > 0
  );
}

/** The "Undo" of removing a custom mark: it comes back to the catalog (not to the panel). */
export function restoreCustomMark(db: SqlDb, ctx: Ctx, id: string): boolean {
  return (
    db.run(
      'UPDATE event_type SET archived = 0, updated_at = ? WHERE id = ? AND builtin = 0 AND archived = 1',
      [toIso(ctx.now()), id],
    ).changes > 0
  );
}
