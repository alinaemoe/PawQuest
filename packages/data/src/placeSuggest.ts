import {
  clusterStays,
  dbscan,
  filterTrack,
  findStays,
  haversineDistanceM,
  median,
  type LatLon,
  type Stay,
  type StayScaleName,
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
  /** The size of the proposed place: a stand or doorway, a clearing, or a park-sized area. */
  readonly scale: StayScaleName;
  /** A radius that covers the visits: their spread plus a margin, never below 40 m. */
  readonly radiusM: number;
  /** Number of stays in the cluster. */
  readonly stopCount: number;
  readonly walkCount: number;
  readonly totalDurationS: number;
  /** Walks that stayed here, to link to the place once it is named. */
  readonly walkIds: readonly string[];
}

export function proposalKey(at: LatLon): string {
  return `place-suggest:${String(Math.floor(at.lat / CELL_DEG))}:${String(Math.floor(at.lon / CELL_DEG))}`;
}

/** Small up to a doorway-sized 40 m, medium up to a clearing-sized 120 m, large beyond. */
function scaleOfRadius(radiusM: number): StayScaleName {
  return radiusM <= 40 ? 'small' : radiusM <= 120 ? 'medium' : 'large';
}

/** The stays of one walk (A-28): its filtered track, manual pauses left out. */
export function staysOfWalk(db: SqlDb, walkId: string, now: number): Stay[] {
  const points = filterTrack(listTrackPoints(db, walkId)).points;
  if (points.length < 2) {
    return [];
  }
  const pausedIntervals = db
    .all(
      "SELECT started_at, ended_at FROM walk_segment WHERE walk_id = ? AND kind = 'paused' AND indoor = 0",
      [walkId],
    )
    .map((r) => ({
      fromTs: fromIso(String(r['started_at'])),
      toTs: r['ended_at'] === null ? now : fromIso(String(r['ended_at'])),
    }));
  return findStays(points, { pausedIntervals });
}

export interface ProposeOptions {
  /** Only walks that started within this many days. Default 120. */
  readonly sinceDays?: number;
  /** At most this many of the latest walks. Default 80. */
  readonly maxWalks?: number;
}

/**
 * New places from repeated stays (A-12b, D-62): the stays of the recent GPS walks are clustered
 * with a reach that follows their own size (visits to a park wander over hundreds of meters,
 * visits to a doorway do not). A cluster must span at least two walks and lie outside every saved
 * place (inside its radius, at least 60 m); a smaller cluster inside a larger one is dropped. The
 * proposed radius covers the visits. Longest total time first.
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
  const stays = walkIds.flatMap((walkId) =>
    staysOfWalk(db, walkId, now).map((stay) => ({
      lat: stay.lat,
      lon: stay.lon,
      walkId,
      durationS: stay.durationS,
      radiusM: stay.radiusM,
    })),
  );
  const saved = db
    .all('SELECT lat, lon, radius_m FROM place WHERE deleted_at IS NULL')
    .map((r) => ({ lat: Number(r['lat']), lon: Number(r['lon']), radiusM: Number(r['radius_m']) }));

  return clusterStays(stays, saved).map((cluster) => ({
    lat: cluster.lat,
    lon: cluster.lon,
    key: proposalKey(cluster),
    scale: scaleOfRadius(cluster.radiusM),
    radiusM: cluster.radiusM,
    stopCount: cluster.stayCount,
    walkCount: cluster.walkCount,
    totalDurationS: cluster.totalDurationS,
    walkIds: [
      ...new Set(
        cluster.stayIndices.flatMap((i) => {
          const walkId = stays[i]?.walkId;
          return walkId === undefined ? [] : [walkId];
        }),
      ),
    ],
  }));
}

/**
 * Where a walk "was" for naming its place: the centre of its longest stay, else its first point.
 * Null for a walk without a track.
 */
export function walkAnchor(db: SqlDb, walkId: string, now: number): LatLon | null {
  const longest = [...staysOfWalk(db, walkId, now)].sort((a, b) => b.durationS - a.durationS)[0];
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

export interface BaseProposal extends LatLon {
  /** Remembers that the owner does not want a suggestion at this spot. */
  readonly key: string;
  /** Walks that began or ended here. */
  readonly walkIds: readonly string[];
}

/** Walks must start or end within this distance of each other to share a base. */
const BASE_REACH_M = 60;
const BASE_MIN_WALKS = 3;

/**
 * Where the owner keeps starting and ending walks (D-62, 5.2): three or more recent walks that
 * began or ended within 60 m of one spot. Spots that already lie in a saved place are left out
 * (the owner has named them, a home among them is theirs to set). Most walks first.
 */
export function proposeBases(db: SqlDb, now: number, options: ProposeOptions = {}): BaseProposal[] {
  const since = toIso(now - (options.sinceDays ?? 120) * DAY);
  const walkIds = db
    .all(
      `SELECT id FROM walk
        WHERE status = 'completed' AND mode = 'gps' AND deleted_at IS NULL AND started_at >= ?
        ORDER BY started_at DESC LIMIT ?`,
      [since, options.maxWalks ?? 80],
    )
    .map((r) => String(r['id']));
  const ends: { lat: number; lon: number; walkId: string }[] = [];
  for (const walkId of walkIds) {
    const points = filterTrack(listTrackPoints(db, walkId)).points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first !== undefined && last !== undefined && points.length > 1) {
      ends.push(
        { lat: first.lat, lon: first.lon, walkId },
        { lat: last.lat, lon: last.lon, walkId },
      );
    }
  }
  const saved = db
    .all('SELECT lat, lon, radius_m FROM place WHERE deleted_at IS NULL')
    .map((r) => ({ lat: Number(r['lat']), lon: Number(r['lon']), radiusM: Number(r['radius_m']) }));
  const found: BaseProposal[] = [];
  for (const cluster of dbscan(ends, BASE_REACH_M, BASE_MIN_WALKS).clusters) {
    const members = cluster.flatMap((i) => (ends[i] === undefined ? [] : [ends[i]]));
    const walks = [...new Set(members.map((m) => m.walkId))];
    if (walks.length < BASE_MIN_WALKS) {
      continue;
    }
    const centre = {
      lat: median(members.map((m) => m.lat)),
      lon: median(members.map((m) => m.lon)),
    };
    if (saved.some((p) => haversineDistanceM(centre, p) <= Math.max(p.radiusM, BASE_REACH_M))) {
      continue;
    }
    found.push({
      ...centre,
      key: `base-suggest:${proposalKey(centre).split(':').slice(1).join(':')}`,
      walkIds: walks,
    });
  }
  return found.sort((a, b) => b.walkIds.length - a.walkIds.length);
}
