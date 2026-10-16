import {
  filterTrack,
  findRoutes,
  haversineDistanceM,
  MIN_ROUTE_LENGTH_M,
  passOfRoute,
  pathLength,
  placeContaining,
  routeShape,
  simplifyTrack,
  type ChronoPlace,
  type ChronoStep,
  type LatLon,
} from '@pawquest/core';

import { walkChronology } from './chronology';
import { expectFound, toIso, type Ctx } from './ids';
import { listPlaces } from './places';
import { listTrackPoints } from './recorder';
import type { SqlDb, SqlRow } from './sql';
import { getWalk } from './walks';

export type RouteKind = 'path' | 'loop';

export interface Route {
  readonly id: string;
  readonly name: string;
  readonly kind: RouteKind;
  /** The way itself, a thinned line. */
  readonly line: readonly LatLon[];
  readonly lengthM: number;
  readonly startPlaceId: string | null;
  readonly endPlaceId: string | null;
}

const DAY = 86_400_000;
/** A stop on the way longer than this is not "a stop on the way" but a visit of its own. */
const MAX_STOP_MS = 30 * 60_000;
const MAX_STOPS = 2;

function toRoute(row: SqlRow): Route {
  const raw = JSON.parse(String(row['geometry'])) as [number, number][];
  return {
    id: String(row['id']),
    name: String(row['name']),
    kind: String(row['kind']) as RouteKind,
    line: raw.map(([lat, lon]) => ({ lat, lon })),
    lengthM: Number(row['length_m']),
    startPlaceId: row['start_place_id'] === null ? null : String(row['start_place_id']),
    endPlaceId: row['end_place_id'] === null ? null : String(row['end_place_id']),
  };
}

/** The line kept for a route: simplified to about a hundred vertices at most. */
function lineOf(points: readonly LatLon[]): LatLon[] {
  const kept = simplifyTrack(points, { epsilonM: 6, maxVertices: 120 });
  return kept.flatMap((i) => {
    const p = points[i];
    return p === undefined ? [] : [p];
  });
}

export interface RouteInput {
  readonly name: string;
  readonly points: readonly LatLon[];
  readonly startPlaceId?: string | null;
  readonly endPlaceId?: string | null;
}

/** Saves a route: its name and the way (a loop when it begins and ends at one place). */
export function createRoute(db: SqlDb, ctx: Ctx, input: RouteInput): Route {
  const name = input.name.trim();
  if (name === '') {
    throw new RangeError('A route needs a name');
  }
  const line = lineOf(routeShape(input.points));
  const first = line[0];
  const last = line[line.length - 1];
  if (first === undefined || last === undefined || line.length < 2) {
    throw new RangeError('A route needs a way of at least two points');
  }
  const id = ctx.newId();
  const now = toIso(ctx.now());
  db.run(
    `INSERT INTO route (id, name, kind, geometry, length_m, start_place_id, end_place_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      haversineDistanceM(first, last) <= 60 ? 'loop' : 'path',
      JSON.stringify(line.map((p) => [p.lat, p.lon])),
      Math.round(pathLength(line)),
      input.startPlaceId ?? null,
      input.endPlaceId ?? null,
      now,
      now,
    ],
  );
  return expectFound(getRoute(db, id), 'route');
}

export function getRoute(db: SqlDb, id: string): Route | null {
  const row = db.all('SELECT * FROM route WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toRoute(row);
}

/** All saved routes, oldest first. */
export function listRoutes(db: SqlDb): Route[] {
  return db
    .all('SELECT * FROM route WHERE deleted_at IS NULL ORDER BY created_at, id')
    .map(toRoute);
}

export function renameRoute(db: SqlDb, ctx: Ctx, id: string, name: string): Route {
  const tidy = name.trim();
  if (tidy === '') {
    throw new RangeError('A route needs a name');
  }
  db.run('UPDATE route SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
    tidy,
    toIso(ctx.now()),
    id,
  ]);
  return expectFound(getRoute(db, id), 'route');
}

/** Removes a route from the lists; the walks keep everything (a route is only a label on them). */
export function deleteRoute(db: SqlDb, ctx: Ctx, id: string): boolean {
  return (
    db.run('UPDATE route SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
      toIso(ctx.now()),
      toIso(ctx.now()),
      id,
    ]).changes > 0
  );
}

/** A way that may be a route: the points, with what is needed to put it in a walk's timeline. */
interface Stretch {
  readonly walkId: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly points: readonly LatLon[];
  /** Time spent walking on it (the stops are not in it). */
  readonly walkingS: number;
  /** Visits on the way (a shop on the road to Mom's). */
  readonly stops: number;
}

function trackOf(db: SqlDb, walkId: string): readonly { ts: number; lat: number; lon: number }[] {
  return filterTrack(listTrackPoints(db, walkId)).points;
}

/** The walking legs of a walk, each a stretch; with short visits between legs joined into longer ones. */
function stretchesOf(db: SqlDb, walkId: string, now: number, withStops: boolean): Stretch[] {
  const chronology = walkChronology(db, walkId, now);
  if (chronology === null) {
    return [];
  }
  const track = trackOf(db, walkId);
  const between = (fromTs: number, toTs: number): LatLon[] =>
    track.filter((p) => p.ts >= fromTs && p.ts <= toTs);
  const steps: readonly ChronoStep[] = chronology.steps;
  const out: Stretch[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const first = steps[i];
    if (first?.kind !== 'leg') {
      continue;
    }
    let walkingS = first.durationS;
    let toTs = first.toTs;
    out.push({
      walkId,
      fromTs: first.fromTs,
      toTs,
      points: between(first.fromTs, toTs),
      walkingS,
      stops: 0,
    });
    if (!withStops) {
      continue;
    }
    let stops = 0;
    for (let j = i + 1; j + 1 < steps.length && stops < MAX_STOPS; j += 2) {
      const visit = steps[j];
      const next = steps[j + 1];
      if (
        visit?.kind !== 'visit' ||
        next?.kind !== 'leg' ||
        visit.toTs - visit.fromTs > MAX_STOP_MS
      ) {
        break;
      }
      stops += 1;
      walkingS += next.durationS;
      toTs = next.toTs;
      out.push({
        walkId,
        fromTs: first.fromTs,
        toTs,
        points: between(first.fromTs, toTs),
        walkingS,
        stops,
      });
    }
  }
  return out;
}

export interface RoutePass {
  readonly walkId: string;
  readonly startedAt: number;
  readonly fromTs: number;
  readonly toTs: number;
  /** Along the route's own line, or against it. */
  readonly direction: 'forward' | 'backward';
  readonly lengthM: number;
  /** Time on foot on the way, without the stops. */
  readonly walkingS: number;
  /** Stops on the way: 0 for a pass without one. */
  readonly stops: number;
}

/**
 * Every time a route was walked (R-10): the walking legs of the recent walks that follow its line,
 * a shop on the way is a stop, not the end of the pass. The same way back is a pass backward.
 * Newest first.
 */
export function routePasses(
  db: SqlDb,
  route: Route,
  now: number,
  options: { readonly sinceDays?: number } = {},
): RoutePass[] {
  const since = toIso(now - (options.sinceDays ?? 365) * DAY);
  const walkIds = db
    .all(
      `SELECT id FROM walk WHERE status = 'completed' AND mode = 'gps' AND deleted_at IS NULL
          AND started_at >= ? ORDER BY started_at DESC`,
      [since],
    )
    .map((r) => String(r['id']));
  const passes: RoutePass[] = [];
  for (const walkId of walkIds) {
    const walk = getWalk(db, walkId);
    if (walk === null) {
      continue;
    }
    // among the stretches of one walk that match, the one with most share per start wins
    const taken: Stretch[] = [];
    const matched: { stretch: Stretch; direction: 'forward' | 'backward'; share: number }[] = [];
    for (const stretch of stretchesOf(db, walkId, now, true)) {
      if (stretch.points.length < 2) {
        continue;
      }
      const pass = passOfRoute(route.line, stretch.points);
      if (pass !== null) {
        matched.push({ stretch, ...pass });
      }
    }
    matched.sort((a, b) => b.share - a.share || a.stretch.stops - b.stretch.stops);
    for (const m of matched) {
      // a stretch that overlaps one already taken in time is the same pass seen with other stops
      if (taken.some((t) => m.stretch.fromTs < t.toTs && m.stretch.toTs > t.fromTs)) {
        continue;
      }
      taken.push(m.stretch);
      passes.push({
        walkId,
        startedAt: walk.startedAt,
        fromTs: m.stretch.fromTs,
        toTs: m.stretch.toTs,
        direction: m.direction,
        lengthM: Math.round(pathLength(m.stretch.points)),
        walkingS: Math.round(m.stretch.walkingS),
        stops: m.stretch.stops,
      });
    }
  }
  return passes.sort((a, b) => b.fromTs - a.fromTs);
}

export interface RouteProposal {
  /** The way, thinned. */
  readonly line: readonly LatLon[];
  readonly lengthM: number;
  readonly loop: boolean;
  /** How many times it was walked, and in how many walks. */
  readonly legCount: number;
  readonly walkCount: number;
  readonly walkIds: readonly string[];
  /** The saved places at the two ends, when there are any. */
  readonly startPlaceId: string | null;
  readonly endPlaceId: string | null;
  /** Names of the saved places at the ends, for the suggested name ("Дом → Магазин"). */
  readonly startName: string | null;
  readonly endName: string | null;
  /** Remembers that the owner does not want a suggestion for this way. */
  readonly key: string;
}

const KEY_CELL = 0.0015; // about 100 m

/**
 * New routes from the walking legs of the recent walks (A-27): the same way walked three times or
 * more in two walks or more, not yet saved as a route. Most passes first.
 */
export function proposeRoutes(
  db: SqlDb,
  now: number,
  options: { readonly sinceDays?: number; readonly maxWalks?: number } = {},
): RouteProposal[] {
  const since = toIso(now - (options.sinceDays ?? 120) * DAY);
  const walkIds = db
    .all(
      `SELECT id FROM walk WHERE status = 'completed' AND mode = 'gps' AND deleted_at IS NULL
          AND started_at >= ? ORDER BY started_at DESC LIMIT ?`,
      [since, options.maxWalks ?? 60],
    )
    .map((r) => String(r['id']));
  const stretches = walkIds.flatMap((id) => stretchesOf(db, id, now, false));
  const usable = stretches.filter((s) => pathLength(s.points) >= MIN_ROUTE_LENGTH_M);
  if (usable.length < 3) {
    return [];
  }
  const saved = listRoutes(db);
  const places: ChronoPlace[] = listPlaces(db).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    radiusM: p.radiusM,
    boundary: p.boundary ?? undefined,
  }));
  const names = new Map(places.map((p) => [p.id, p.name]));
  const proposals: RouteProposal[] = [];
  for (const group of findRoutes(usable.map((s) => ({ points: s.points, walkId: s.walkId })))) {
    const medoid = usable[group.medoid];
    if (medoid === undefined) {
      continue;
    }
    // a way that is already a saved route is not new
    if (saved.some((r) => passOfRoute(r.line, medoid.points) !== null)) {
      continue;
    }
    const line = lineOf(routeShape(medoid.points));
    const first = line[0];
    const last = line[line.length - 1];
    if (first === undefined || last === undefined) {
      continue;
    }
    const start = placeContaining(first, places)?.id ?? null;
    const end = placeContaining(last, places)?.id ?? null;
    const startName = start === null ? undefined : names.get(start);
    const endName = end === null ? undefined : names.get(end);
    proposals.push({
      line,
      lengthM: Math.round(group.lengthM),
      loop: group.loop,
      legCount: group.legIndices.length,
      walkCount: group.walkCount,
      walkIds: [...new Set(group.legIndices.flatMap((i) => usable[i]?.walkId ?? []))],
      startPlaceId: start,
      endPlaceId: end,
      startName: startName ?? null,
      endName: endName ?? null,
      key: `route-suggest:${String(Math.floor(first.lat / KEY_CELL))}:${String(Math.floor(first.lon / KEY_CELL))}:${String(Math.floor(last.lat / KEY_CELL))}:${String(Math.floor(last.lon / KEY_CELL))}`,
    });
  }
  return proposals;
}

/** The walk's own passes of saved routes, for its summary ("5-й раз по маршруту"). */
export function walkRoutePasses(
  db: SqlDb,
  walkId: string,
  now: number,
): {
  readonly route: Route;
  readonly pass: RoutePass;
  readonly index: number;
  readonly total: number;
}[] {
  const found: { route: Route; pass: RoutePass; index: number; total: number }[] = [];
  for (const route of listRoutes(db)) {
    const passes = routePasses(db, route, now);
    const ordered = [...passes].sort((a, b) => a.fromTs - b.fromTs);
    ordered.forEach((pass, i) => {
      if (pass.walkId === walkId) {
        found.push({ route, pass, index: i + 1, total: ordered.length });
      }
    });
  }
  return found;
}
