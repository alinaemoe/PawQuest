/** Mean Earth radius in metres. Fixed by the spec (docs/09-analytics-algorithms.md, A-01). */
export const EARTH_RADIUS_M = 6371008.8;

/** A WGS-84 style position in decimal degrees. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * True when both coordinates are finite and inside their legal ranges
 * (latitude [-90, 90], longitude [-180, 180]). Never throws.
 */
export function isValidLatLon(p: LatLon): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

function assertValidLatLon(p: LatLon, label: string): void {
  // Values are deliberately not echoed in the message: coordinates are personal location data.
  if (!isValidLatLon(p)) {
    throw new RangeError(
      `${label} must have finite lat in [-90, 90] and finite lon in [-180, 180]`,
    );
  }
}

/**
 * Great-circle distance in metres between two points on a sphere of radius {@link EARTH_RADIUS_M}.
 *
 * Accuracy notes (measured, see the tests): at walking scale the result is exact to far below a
 * micrometre of floating-point noise; for near-antipodal pairs the error can reach ~0.1 m because
 * asin is ill-conditioned near 1. Independently of floating point, a sphere differs from the WGS-84
 * ellipsoid by up to ~0.5 %, which is accepted by the spec (A-01).
 *
 * @throws RangeError if either point has a non-finite or out-of-range coordinate.
 */
export function haversineDistanceM(a: LatLon, b: LatLon): number {
  assertValidLatLon(a, 'first point');
  assertValidLatLon(b, 'second point');

  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;

  // For near-antipodal points rounding can push h one ulp above 1 (verified in the tests);
  // clamping keeps asin inside its domain regardless of platform rounding.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}
