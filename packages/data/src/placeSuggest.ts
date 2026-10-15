import {
  analyzeMotion,
  filterTrack,
  suggestPlaces,
  type LatLon,
  type StopInput,
} from '@pawquest/core';

import { fromIso, toIso, type Ctx } from './ids';
import { listTrackPoints } from './recorder';
import type { SqlDb } from './sql';

const DAY = 86_400_000;
/** Same grid as the place table (about 55 m), so a declined proposal stays declined nearby. */
const CELL_DEG = 0.0005;

export interface PlaceProposal extends LatLon {
  /** Identifies the spot for "do not suggest here": the grid cell of the centre. */
  readonly key: string;
  readonly stopCount: number;
  readonly walkCount: number;
  readonly totalDurationS: number;
  /** Walks that stopped here, to link to the place once it is named. */
  readonly walkIds: readonly string[];
}

export function proposalKey(at: LatLon): string {
  return `place-suggest:${String(Math.floor(at.lat / CELL_DEG))}:${String(Math.floor(at.lon / CELL_DEG))}`;
}

/** The stops of one walk (A-03): its filtered track, manual pauses left out. */
function stopsOfWalk(db: SqlDb, walkId: string, now: number): StopInput[] {
  const points = filterTrack(listTrackPoints(db, walkId)).points;
  if (points.length < 2) {
    return [];
  }
  const pausedIntervals = db
    .all("SELECT started_at, ended_at FROM walk_segment WHERE walk_id = ? AND kind = 'paused'", [
      walkId,
    ])
    .map((r) => ({
      fromTs: fromIso(String(r['started_at'])),
      toTs: r['ended_at'] === null ? now : fromIso(String(r['ended_at'])),
    }));
  return analyzeMotion(points, { pausedIntervals }).stops.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    walkId,
    durationS: s.durationS,
  }));
}

export interface ProposeOptions {
  /** Only walks that started within this many days. Default 120. */
  readonly sinceDays?: number;
  /** At most this many of the latest walks. Default 80. */
  readonly maxWalks?: number;
}

/**
 * New places from repeated long stops (A-12, D-51): stops of the recent GPS walks are clustered, a
 * cluster must span at least two walks and be farther than 60 m from every saved place. Longest
 * total stop time first.
 */
export function proposePlaces(
  db: SqlDb,
  now: number,
  options: ProposeOptions = {},
): PlaceProposal[] {
  const since = toIso(now - (options.sinceDays ?? 120) * DAY);
  const walkIds = db
    .all(
      `SELECT id FROM walk
        WHERE status = 'completed' AND mode = 'gps' AND deleted_at IS NULL AND started_at >= ?
        ORDER BY started_at DESC LIMIT ?`,
      [since, options.maxWalks ?? 80],
    )
    .map((r) => String(r['id']));
  if (walkIds.length < 2) {
    return [];
  }
  const stops = walkIds.flatMap((id) => stopsOfWalk(db, id, now));
  const saved = db
    .all('SELECT lat, lon FROM place WHERE deleted_at IS NULL')
    .map((r) => ({ lat: Number(r['lat']), lon: Number(r['lon']) }));
  return suggestPlaces(stops, saved).map((s) => ({
    lat: s.lat,
    lon: s.lon,
    key: proposalKey(s),
    stopCount: s.stopCount,
    walkCount: s.walkCount,
    totalDurationS: s.totalDurationS,
    walkIds: [...new Set(s.stopIndices.map((i) => stops[i]?.walkId ?? ''))].filter(
      (id) => id !== '',
    ),
  }));
}

/**
 * Where a walk "was" for naming its place: the centre of its longest stop, else its first point.
 * Null for a walk without a track.
 */
export function walkAnchor(db: SqlDb, walkId: string, now: number): LatLon | null {
  const longest = stopsOfWalk(db, walkId, now).sort((a, b) => b.durationS - a.durationS)[0];
  if (longest !== undefined) {
    return { lat: longest.lat, lon: longest.lon };
  }
  const first = listTrackPoints(db, walkId)[0];
  return first === undefined ? null : { lat: first.lat, lon: first.lon };
}

/** Links walks that have no place yet to a newly named place; returns how many were linked. */
export function linkWalksToPlace(
  db: SqlDb,
  ctx: Ctx,
  placeId: string,
  walkIds: readonly string[],
): number {
  let linked = 0;
  const nowIso = toIso(ctx.now());
  db.transaction(() => {
    for (const id of walkIds) {
      linked += db.run(
        'UPDATE walk SET place_id = ?, place_kind = NULL, updated_at = ? WHERE id = ? AND place_id IS NULL',
        [placeId, nowIso, id],
      ).changes;
    }
  });
  return linked;
}
