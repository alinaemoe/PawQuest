import type { WalkLine } from '@pawquest/data';

/** The map of many walks (docs/23, step 3.18): which route a tap meant, and the frame around all of them. */

const M_PER_DEG = 111_195;

/** The distance in metres from a point to a segment, on a flat patch of the earth around it. */
function segmentDistanceM(
  point: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const k = Math.cos((point[1] * Math.PI) / 180);
  const px = (point[0] - a[0]) * k * M_PER_DEG;
  const py = (point[1] - a[1]) * M_PER_DEG;
  const bx = (b[0] - a[0]) * k * M_PER_DEG;
  const by = (b[1] - a[1]) * M_PER_DEG;
  const length2 = bx * bx + by * by;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / length2));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * The walk whose route passes closest to a tap, if one passes within `toleranceM`; the newest
 * wins a tie (routes of one habit lie on top of each other, and the latest walk is the one to open).
 */
export function nearestWalk(
  lines: readonly WalkLine[],
  tap: readonly [number, number],
  toleranceM: number,
): string | null {
  let best: { id: string; distance: number; startedAt: number } | null = null;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.coordinates.length; i += 1) {
      const a = line.coordinates[i];
      const b = line.coordinates[i + 1];
      if (a === undefined || b === undefined) {
        continue;
      }
      const distance = segmentDistanceM(tap, a, b);
      if (
        distance <= toleranceM &&
        (best === null ||
          distance < best.distance - 0.5 ||
          (Math.abs(distance - best.distance) <= 0.5 && line.startedAt > best.startedAt))
      ) {
        best = { id: line.walkId, distance, startedAt: line.startedAt };
      }
    }
  }
  return best?.id ?? null;
}

/** [west, south, east, north] around every route, or null when there is none. */
export function linesBounds(lines: readonly WalkLine[]): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line.coordinates) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return west === Infinity ? null : [west, south, east, north];
}
