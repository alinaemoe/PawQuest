import type { LatLon } from '../geo/haversine';

function medianOfOdd(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = values[(values.length - 1) / 2];
  if (middle === undefined) {
    throw new Error('median of an empty window');
  }
  return middle;
}

/**
 * Display smoothing (spec A-02): a sliding median over `window` points, applied separately to
 * latitude and longitude. The stored raw data is never changed: this returns a new array.
 *
 * The first and last points are kept exactly. Near the ends the window shrinks symmetrically
 * (3 points for the second and second-to-last), so every median is over an odd count.
 * Other fields of each point (timestamps, accuracy, ...) are preserved.
 *
 * Limitation: tracks crossing the antimeridian (longitude +-180) are not supported.
 *
 * @param window odd positive integer, default 5.
 * @throws RangeError if `window` is not an odd positive integer.
 */
export function smoothMedian<T extends LatLon>(points: readonly T[], window = 5): T[] {
  if (!Number.isInteger(window) || window < 1 || window % 2 === 0) {
    throw new RangeError('window must be an odd positive integer');
  }
  const last = points.length - 1;
  const half = (window - 1) / 2;

  return points.map((p, i) => {
    if (i === 0 || i === last) {
      return p;
    }
    const reach = Math.min(half, i, last - i);
    if (reach === 0) {
      return p;
    }
    const lats: number[] = [];
    const lons: number[] = [];
    for (let j = i - reach; j <= i + reach; j++) {
      const q = points[j];
      if (q !== undefined) {
        lats.push(q.lat);
        lons.push(q.lon);
      }
    }
    return { ...p, lat: medianOfOdd(lats), lon: medianOfOdd(lons) };
  });
}
