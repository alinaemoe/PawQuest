import {
  applyFix,
  initialTrackFilterState,
  simplifyTrack,
  speedProfile,
  zoneVisits,
  type SpeedProfile,
  type TimeRange,
} from '@pawquest/core';

import { fromIso } from './ids';
import { listWalkPhotos } from './photos';
import { listPlaces, type PlaceCategory } from './places';
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

/** A stay inside a saved place, for the bands of the slider and the colours of the route. */
export interface ReplayZone {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly fromTs: number;
  readonly toTs: number;
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
  /** Where the walk was by the saved places (D-73), oldest first; places inside each other overlap. */
  readonly zones: readonly ReplayZone[];
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
  // the same filter as the walk's distance, so the distance in the replay ends where the walk's does
  const points: ReplayPointData[] = [];
  const cumulativeM: number[] = [];
  let state = initialTrackFilterState();
  let total = 0;
  for (const fix of listTrackPoints(db, walkId)) {
    const result = applyFix(state, fix);
    state = result.state;
    if (result.decision.kind === 'accepted') {
      total += result.decision.distanceDeltaM;
      cumulativeM.push(total);
      points.push({
        ts: fix.ts,
        lat: fix.lat,
        lon: fix.lon,
        ...(fix.speedMps === undefined ? {} : { speedMps: fix.speedMps }),
      });
    }
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || points.length < 2) {
    return null;
  }
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
  const places = listPlaces(db);
  const known = new Map(places.map((p) => [p.id, p]));
  const zones = zoneVisits(
    points.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon })),
    places.map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      radiusM: p.radiusM,
      boundary: p.boundary ?? undefined,
    })),
  ).flatMap((z): ReplayZone[] => {
    const place = known.get(z.placeId);
    return place === undefined
      ? []
      : [
          {
            placeId: z.placeId,
            name: place.name,
            category: place.category,
            fromTs: z.fromTs,
            toTs: z.toTs,
          },
        ];
  });
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
    zones,
    profile: speedProfile(points, { pausedRanges: paused }),
  };
}
