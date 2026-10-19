import { filterTrack, simplifyTrack } from '@pawquest/core';

import { listTrackPoints } from './recorder';
import type { SqlDb } from './sql';

/** The route of a walk thinned for a map that shows many of them (docs/23, step 3.18). */
export interface WalkLine {
  readonly walkId: string;
  readonly startedAt: number;
  /** [lon, lat] pairs, at most 1500 of them. */
  readonly coordinates: readonly (readonly [number, number])[];
}

/**
 * The thinned routes of the given walks, in the order given. A bigger tolerance than on a single
 * walk's map (6 m, not 2): a map of thirty walks has no use for the wobble. A walk with fewer
 * than two points has no route and is left out.
 */
export function walkLines(
  db: SqlDb,
  walks: readonly { readonly id: string; readonly startedAt: number }[],
  epsilonM = 6,
): WalkLine[] {
  return walks.flatMap((walk) => {
    const points = filterTrack(listTrackPoints(db, walk.id)).points;
    if (points.length < 2) {
      return [];
    }
    const kept = new Set(simplifyTrack(points, { epsilonM }));
    return [
      {
        walkId: walk.id,
        startedAt: walk.startedAt,
        coordinates: points
          .filter((_, i) => kept.has(i))
          .map((p): [number, number] => [p.lon, p.lat]),
      },
    ];
  });
}
