// Public API of @pawquest/core. Add exports here as modules are implemented (TDD, one at a time).
export { EARTH_RADIUS_M, haversineDistanceM, isValidLatLon } from './geo/haversine';
export type { LatLon } from './geo/haversine';
export {
  DEFAULT_TRACK_FILTER_CONFIG,
  applyFix,
  filterTrack,
  initialTrackFilterState,
} from './track/filter';
export type {
  DropReason,
  FilteredTrack,
  FixDecision,
  GpsFix,
  TrackFilterConfig,
  TrackFilterState,
  TrackGap,
} from './track/filter';
