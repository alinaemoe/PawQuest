import {
  filterTrack,
  haversineDistanceM,
  simplifyTrack,
  speedProfile,
  type SpeedProfile,
  type TimeRange,
} from '@pawquest/core';

import { fromIso } from './ids';
import { listWalkPhotos } from './photos';
import { listTrackPoints } from './recorder';
import { walkRoutePasses } from './routes';
import type { SqlDb } from './sql';
import { getWalk } from './walks';

/** What the Replay screen of a walk is made from (docs/04, S07; docs/23, step 3.11). */

export interface ReplayPointData {
  readonly ts: number;
  readonly lat: number;
  readonly lon: number;
  readonly speedMps?: number;
}

export interface ReplayEvent {
  readonly id: string;
  readonly typeId: string;
  readonly ts: number;
  readonly reaction: number | null;
}

export interface ReplayPhoto {
  readonly id: string;
  readonly uri: string;
  readonly takenAt: number;
}

export interface ReplayPass {
  readonly routeId: string;
  readonly routeName: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly direction: 'forward' | 'backward';
}

export interface WalkReplay {
  readonly walkId: string;
  readonly startTs: number;
  readonly endTs: number;
  /** Accepted fixes in time order. */
  readonly points: readonly ReplayPointData[];
  /** Metres from the start to each point. */
  readonly cumulativeM: readonly number[];
  /** The route thinned for drawing, as [lon, lat]. */
  readonly line: readonly (readonly [number, number])[];
  /** Pauses of the owner (the position stays where it was). */
  readonly paused: readonly TimeRange[];
  readonly events: readonly ReplayEvent[];
  readonly photos: readonly ReplayPhoto[];
  readonly passes: readonly ReplayPass[];
  readonly profile: SpeedProfile | null;
}

/**
 * Everything the replay of a walk needs, read once: the track, the pauses, the events and photos
 * in time order, the saved routes the walk went along, and the speed profile (A-25). Null for a
 * walk that is not there or has fewer than two points: there is nothing to play.
 */
export function walkReplay(db: SqlDb, walkId: string, now: number): WalkReplay | null {
  const walk = getWalk(db, walkId);
  if (walk === null) {
    return null;
  }
  const points: ReplayPointData[] = filterTrack(listTrackPoints(db, walkId)).points.map((p) => ({
    ts: p.ts,
    lat: p.lat,
    lon: p.lon,
    ...(p.speedMps === undefined ? {} : { speedMps: p.speedMps }),
  }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || points.length < 2) {
    return null;
  }
  let total = 0;
  const cumulativeM = points.map((point, i) => {
    const previous = points[i - 1];
    if (previous !== undefined) {
      total += haversineDistanceM(previous, point);
    }
    return total;
  });
  const kept = new Set(simplifyTrack(points, { epsilonM: 2 }));
  const line = points.filter((_, i) => kept.has(i)).map((p): [number, number] => [p.lon, p.lat]);

  const endTs = walk.endedAt ?? last.ts;
  const paused = db
    .all(
      "SELECT started_at, ended_at FROM walk_segment WHERE walk_id = ? AND kind = 'paused' ORDER BY started_at, rowid",
      [walkId],
    )
    .map((r): TimeRange => ({
      fromTs: fromIso(String(r['started_at'])),
      toTs: r['ended_at'] === null ? endTs : fromIso(String(r['ended_at'])),
    }));
  const events = db
    .all(
      'SELECT id, type_id, ts, reaction FROM event WHERE walk_id = ? AND deleted_at IS NULL ORDER BY ts, id',
      [walkId],
    )
    .map((r): ReplayEvent => ({
      id: String(r['id']),
      typeId: String(r['type_id']),
      ts: fromIso(String(r['ts'])),
      reaction: r['reaction'] === null ? null : Number(r['reaction']),
    }));
  const photos = listWalkPhotos(db, walkId).map((p): ReplayPhoto => ({
    id: p.id,
    uri: p.uri,
    takenAt: p.takenAt,
  }));
  const passes = walkRoutePasses(db, walkId, now).map(({ route, pass }): ReplayPass => ({
    routeId: route.id,
    routeName: route.name,
    fromTs: pass.fromTs,
    toTs: pass.toTs,
    direction: pass.direction,
  }));
  return {
    walkId,
    startTs: Math.min(walk.startedAt, first.ts),
    endTs: Math.max(endTs, last.ts),
    points,
    cumulativeM,
    line,
    paused,
    events,
    photos,
    passes,
    profile: speedProfile(points, { pausedRanges: paused }),
  };
}
