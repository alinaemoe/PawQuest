import { fromIso, toIso } from './ids';
import type { SqlDb, SqlRow } from './sql';
import { getWalk } from './walks';

/** Files for other programs (docs/23, step 3.12): CSV tables of walks and events, a GPX track. */

/** RFC 4180: a field with a comma, a quote or a line break is quoted, quotes are doubled. */
export function csvField(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (fields: readonly (string | number | null)[]): string =>
  fields.map(csvField).join(',');

/** Excel reads a UTF-8 file as Cyrillic only with this mark at the start. */
export const CSV_BOM = '﻿';

const WALK_COLUMNS = [
  'walk_id',
  'started_at',
  'ended_at',
  'duration_s',
  'moving_s',
  'paused_s',
  'distance_m',
  'mode',
  'place',
  'mood',
  'distraction',
  'temp_c',
  'precip_mm',
  'notes',
] as const;

const num = (row: SqlRow, key: string): number | null => {
  const value = row[key];
  return value === null || value === undefined ? null : Number(value);
};
const text = (row: SqlRow, key: string): string | null => {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
};

/** The finished walks of a dog, one line each, oldest first. Times are UTC (ISO 8601). */
export function walksCsv(db: SqlDb, dogId: string): string {
  const rows = db.all(
    `SELECT w.*, p.name AS place_name, s.temp_c, s.precip_mm
       FROM walk w
       JOIN walk_dog d ON d.walk_id = w.id
       LEFT JOIN place p ON p.id = w.place_id
       LEFT JOIN weather_snapshot s ON s.walk_id = w.id
      WHERE d.dog_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL
      ORDER BY w.started_at, w.id`,
    [dogId],
  );
  const lines = [csvLine(WALK_COLUMNS)];
  for (const r of rows) {
    lines.push(
      csvLine([
        text(r, 'id'),
        text(r, 'started_at'),
        text(r, 'ended_at'),
        num(r, 'duration_s'),
        num(r, 'moving_s'),
        num(r, 'paused_s'),
        num(r, 'distance_m') === null ? null : Math.round(num(r, 'distance_m') ?? 0),
        text(r, 'mode'),
        text(r, 'place_name'),
        num(r, 'mood'),
        num(r, 'distraction'),
        num(r, 'temp_c'),
        num(r, 'precip_mm'),
        text(r, 'notes'),
      ]),
    );
  }
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

const EVENT_COLUMNS = [
  'event_id',
  'walk_id',
  'time',
  'type',
  'reaction',
  'distance_m',
  'distance_bucket',
  'recovery_s',
  'lat',
  'lon',
  'note',
] as const;

/** The events of a dog, oldest first; `typeLabel` gives the name of a type in the owner's language. */
export function eventsCsv(db: SqlDb, dogId: string, typeLabel: (typeId: string) => string): string {
  const rows = db.all(
    'SELECT * FROM event WHERE dog_id = ? AND deleted_at IS NULL ORDER BY ts, id',
    [dogId],
  );
  const lines = [csvLine(EVENT_COLUMNS)];
  for (const r of rows) {
    lines.push(
      csvLine([
        text(r, 'id'),
        text(r, 'walk_id'),
        text(r, 'ts'),
        typeLabel(String(r['type_id'])),
        num(r, 'reaction'),
        num(r, 'distance_m'),
        text(r, 'distance_bucket'),
        num(r, 'recovery_s'),
        num(r, 'lat'),
        num(r, 'lon'),
        text(r, 'note'),
      ]),
    );
  }
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

export function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A new segment of the track starts after a pause or a gap longer than this. */
const GPX_SPLIT_MS = 120_000;

/**
 * The track of a walk as GPX 1.1: the recorded points (the ones the owner cut off are left out),
 * a new segment after every pause or long gap, and a waypoint for each event that has a position.
 * Null for a walk that is not there.
 */
export function walkGpx(
  db: SqlDb,
  walkId: string,
  typeLabel: (typeId: string) => string,
): string | null {
  const walk = getWalk(db, walkId);
  if (walk === null) {
    return null;
  }
  const pauses = db
    .all("SELECT started_at, ended_at FROM walk_segment WHERE walk_id = ? AND kind = 'paused'", [
      walkId,
    ])
    .map((r) => ({
      from: fromIso(String(r['started_at'])),
      to: r['ended_at'] === null ? Number.POSITIVE_INFINITY : fromIso(String(r['ended_at'])),
    }));
  const segments: string[][] = [];
  let previous: number | null = null;
  const track = db
    .all(
      'SELECT ts, lat, lon, altitude_m FROM track_point WHERE walk_id = ? AND excluded = 0 ORDER BY ts, id',
      [walkId],
    )
    .map((r) => ({
      ts: fromIso(String(r['ts'])),
      lat: Number(r['lat']),
      lon: Number(r['lon']),
      altitudeM: num(r, 'altitude_m'),
    }));
  for (const p of track) {
    const last: number | null = previous;
    const split =
      last === null ||
      p.ts - last > GPX_SPLIT_MS ||
      pauses.some((r) => r.from >= last && r.from < p.ts);
    if (split) {
      segments.push([]);
    }
    previous = p.ts;
    const ele = p.altitudeM === null ? '' : `<ele>${String(round(p.altitudeM, 1))}</ele>`;
    segments[segments.length - 1]?.push(
      `<trkpt lat="${String(round(p.lat, 7))}" lon="${String(round(p.lon, 7))}">${ele}<time>${toIso(p.ts)}</time></trkpt>`,
    );
  }
  const waypoints = db
    .all(
      'SELECT type_id, ts, lat, lon, note FROM event WHERE walk_id = ? AND deleted_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL ORDER BY ts, id',
      [walkId],
    )
    .map((r) => {
      const note = text(r, 'note');
      return `<wpt lat="${String(num(r, 'lat'))}" lon="${String(num(r, 'lon'))}"><time>${String(text(r, 'ts'))}</time><name>${xmlText(typeLabel(String(r['type_id'])))}</name>${note === null ? '' : `<desc>${xmlText(note)}</desc>`}</wpt>`;
    });
  const name = walk.title ?? toIso(walk.startedAt);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="PawQuest" xmlns="http://www.topografix.com/GPX/1/1">',
    `<metadata><name>${xmlText(name)}</name><time>${toIso(walk.startedAt)}</time></metadata>`,
    ...waypoints,
    `<trk><name>${xmlText(name)}</name>${segments.map((s) => `<trkseg>${s.join('')}</trkseg>`).join('')}</trk>`,
    '</gpx>',
    '',
  ].join('\n');
}

function round(value: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}
