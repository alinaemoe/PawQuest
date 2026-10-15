import { dbscan } from '../geo/dbscan';
import { haversineDistanceM, type LatLon } from '../geo/haversine';
import { median } from '../util/median';

/** One stop of a walk (see `analyzeMotion`), tagged with the walk it belongs to. */
export interface StopInput extends LatLon {
  readonly walkId: string;
  readonly durationS: number;
}

export interface PlaceSuggestion extends LatLon {
  /** Number of stops in the cluster. */
  readonly stopCount: number;
  /** Number of different walks the stops come from (at least `minWalks`). */
  readonly walkCount: number;
  readonly totalDurationS: number;
  /** Indices into the input `stops` array, ascending. */
  readonly stopIndices: readonly number[];
}

/** A saved place; its radius says how far it reaches (a park is far larger than a clearing). */
export interface SavedPlace extends LatLon {
  readonly radiusM?: number;
}

export interface SuggestPlacesOptions {
  /** Shortest stop that counts. Default 180 s. */
  readonly minStopS?: number;
  /** DBSCAN radius. Default 40 m. */
  readonly epsM?: number;
  /** DBSCAN minimum neighbours, the point itself included. Default 3. */
  readonly minPts?: number;
  /** A cluster must contain stops from at least this many walks. Default 2. */
  readonly minWalks?: number;
  /** No suggestion if a saved place is this close (inclusive) to the cluster centre. Default 60 m. */
  readonly minDistanceToSavedM?: number;
}

/**
 * Suggests new places from repeated long stops (spec A-12, decision D-51): clusters stops of all
 * walks with DBSCAN, keeps clusters that span several walks, centres them at the median position
 * and skips those inside a saved place (its radius, at least 60 m). Ordered by total stop time, longest
 * first (ties keep discovery order).
 *
 * @throws RangeError for invalid coordinates or durations, or invalid DBSCAN parameters.
 */
export function suggestPlaces(
  stops: readonly StopInput[],
  savedPlaces: readonly SavedPlace[],
  options: SuggestPlacesOptions = {},
): PlaceSuggestion[] {
  const minStopS = options.minStopS ?? 180;
  const minWalks = options.minWalks ?? 2;
  const minDistanceToSavedM = options.minDistanceToSavedM ?? 60;
  if (!stops.every((s) => Number.isFinite(s.durationS))) {
    throw new RangeError('stop durations must be finite numbers');
  }

  const kept: number[] = [];
  stops.forEach((s, i) => {
    if (s.durationS >= minStopS) {
      kept.push(i);
    }
  });
  const points: LatLon[] = kept.map((i) => {
    const s = stops[i];
    return { lat: s?.lat ?? Number.NaN, lon: s?.lon ?? Number.NaN };
  });
  const { clusters } = dbscan(points, options.epsM ?? 40, options.minPts ?? 3);

  const suggestions: PlaceSuggestion[] = [];
  for (const cluster of clusters) {
    const members = cluster.flatMap((k) => {
      const original = kept[k];
      const stop = original === undefined ? undefined : stops[original];
      return original === undefined || stop === undefined ? [] : [{ original, stop }];
    });
    const walkCount = new Set(members.map((m) => m.stop.walkId)).size;
    if (walkCount < minWalks) {
      continue;
    }
    const centre: LatLon = {
      lat: median(members.map((m) => m.stop.lat)),
      lon: median(members.map((m) => m.stop.lon)),
    };
    // already covered: inside a saved place's reach (its radius, at least the minimum distance)
    if (
      savedPlaces.some(
        (place) =>
          haversineDistanceM(place, centre) <= Math.max(minDistanceToSavedM, place.radiusM ?? 0),
      )
    ) {
      continue;
    }
    suggestions.push({
      ...centre,
      stopCount: members.length,
      walkCount,
      totalDurationS: members.reduce((sum, m) => sum + m.stop.durationS, 0),
      stopIndices: members.map((m) => m.original).sort((a, b) => a - b),
    });
  }
  return suggestions.sort((a, b) => b.totalDurationS - a.totalDurationS);
}
