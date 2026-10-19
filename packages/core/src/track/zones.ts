import type { LatLon } from '../geo/haversine';

import { placeHolds, type ChronoPlace } from './chronology';

/**
 * Zones: where a walk was, in terms of the owner's saved places (docs/23, step 3.19). Not stays,
 * not stops: a walk through a park is "in the park" for all of its time inside, moving or not.
 * It is derived from the track and the places, never stored as truth, so a place that is drawn
 * again changes the zones of old walks too.
 *
 * A place is entered when two fixes in a row are inside it and left when the track stays outside
 * for a while: the wobble of a fix at the fence of a park must not make ten visits of one.
 */

export interface ZoneFix extends LatLon {
  readonly ts: number;
  readonly accuracyM?: number | undefined;
}

export interface ZoneOptions {
  /** A place is entered by this many fixes in a row inside it. Default 2. */
  readonly enterFixes?: number;
  /** A place is left after the track has been outside for this long. Default 45 s. */
  readonly exitAfterS?: number;
  /** A gap in the track this short, with the same place on both sides, is still inside. Default 300 s. */
  readonly bridgeS?: number;
  /** A visit shorter than this is only grazing the place and is dropped. Default 20 s. */
  readonly minVisitS?: number;
  /** Fixes less accurate than this do not enter a place (they may still keep one). Default 40 m. */
  readonly maxEnterAccuracyM?: number;
  /** The least reach of a place without a contour. Default 40 m. */
  readonly minReachM?: number;
}

export interface ZoneVisit {
  readonly placeId: string;
  readonly fromTs: number;
  readonly toTs: number;
  readonly dwellS: number;
  /** Time inside the visit with no fix at all (a lift, a shop, the signal lost). */
  readonly gapS: number;
  /** The visit was still going at the last fix of the track. */
  readonly open: boolean;
}

const DEFAULTS = {
  enterFixes: 2,
  exitAfterS: 45,
  bridgeS: 300,
  minVisitS: 20,
  maxEnterAccuracyM: 40,
  minReachM: 40,
} as const;

interface State {
  /** Fixes in a row inside while not yet entered. */
  pending: number;
  pendingFrom: number;
  /** The open visit: where it began, the last fix inside it, gap time inside it. */
  from: number | null;
  lastInside: number;
  gapS: number;
}

/**
 * Every visit of the track to every saved place, oldest first. Places that lie in each other are
 * visited independently: the time in a clearing is also time in the park around it.
 */
export function zoneVisits(
  fixes: readonly ZoneFix[],
  places: readonly ChronoPlace[],
  options: ZoneOptions = {},
): ZoneVisit[] {
  const o = { ...DEFAULTS, ...options };
  const states = new Map<string, State>();
  const visits: ZoneVisit[] = [];
  let previousTs: number | null = null;

  const close = (id: string, state: State, open: boolean): void => {
    if (state.from !== null) {
      const dwellS = (state.lastInside - state.from) / 1000;
      if (dwellS >= o.minVisitS || open) {
        visits.push({
          placeId: id,
          fromTs: state.from,
          toTs: state.lastInside,
          dwellS,
          gapS: state.gapS,
          open,
        });
      }
    }
    state.from = null;
    state.gapS = 0;
    state.pending = 0;
  };

  for (const fix of fixes) {
    const gapS = previousTs === null ? 0 : (fix.ts - previousTs) / 1000;
    for (const place of places) {
      const state =
        states.get(place.id) ??
        ({ pending: 0, pendingFrom: 0, from: null, lastInside: 0, gapS: 0 } satisfies State);
      states.set(place.id, state);
      const inside = placeHolds(fix, place, o.minReachM) !== null;
      if (state.from !== null) {
        if (inside) {
          // a gap with the same place on both sides is time inside, with no fix to show it
          if (gapS > o.bridgeS) {
            close(place.id, state, false);
            state.pending = 1;
            state.pendingFrom = fix.ts;
          } else {
            if (gapS > 30) {
              state.gapS += gapS;
            }
            state.lastInside = fix.ts;
          }
        } else if ((fix.ts - state.lastInside) / 1000 >= o.exitAfterS || gapS > o.bridgeS) {
          close(place.id, state, false);
        }
        continue;
      }
      if (!inside || (fix.accuracyM !== undefined && fix.accuracyM > o.maxEnterAccuracyM)) {
        state.pending = 0;
        continue;
      }
      if (state.pending === 0 || gapS > o.bridgeS) {
        state.pending = 1;
        state.pendingFrom = fix.ts;
      } else {
        state.pending += 1;
      }
      if (state.pending >= o.enterFixes) {
        state.from = state.pendingFrom;
        state.lastInside = fix.ts;
        state.gapS = 0;
      }
    }
    previousTs = fix.ts;
  }
  // a visit is "open" only when the track ends inside it; one that only trailed off is a normal one
  for (const [id, state] of states) {
    close(id, state, state.from !== null && state.lastInside === previousTs);
  }
  return visits.sort((a, b) => a.fromTs - b.fromTs || a.placeId.localeCompare(b.placeId));
}

/** The places the owner was in at a moment (inside a visit, its ends included). */
export function zonesAt(visits: readonly ZoneVisit[], ts: number): string[] {
  return visits.filter((v) => ts >= v.fromTs && ts <= v.toTs).map((v) => v.placeId);
}

export interface MainPlaceOptions {
  /** Places that are bases (home, guests): a base is the main place only when nothing else is. */
  readonly baseIds?: ReadonlySet<string>;
  /** A place must hold at least this much of the walk to be its main place. Default 120 s. */
  readonly minDwellS?: number;
}

/**
 * The place the walk was mostly in: the one with the most time inside, a base (home) only when no
 * other place held the minimum. Null when no place did. Used to name a walk's place when the
 * owner has not picked one.
 */
export function mainPlace(
  visits: readonly ZoneVisit[],
  options: MainPlaceOptions = {},
): string | null {
  const minDwellS = options.minDwellS ?? 120;
  const dwell = new Map<string, number>();
  for (const v of visits) {
    dwell.set(v.placeId, (dwell.get(v.placeId) ?? 0) + v.dwellS);
  }
  const ranked = [...dwell.entries()]
    .filter(([, s]) => s >= minDwellS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bases = options.baseIds ?? new Set<string>();
  return (ranked.find(([id]) => !bases.has(id)) ?? ranked[0])?.[0] ?? null;
}
