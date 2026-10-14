// Public API of @pawquest/core. Add exports here as modules are implemented (TDD, one at a time).
export { EARTH_RADIUS_M, haversineDistanceM, isValidLatLon } from './geo/haversine';
export type { LatLon } from './geo/haversine';
export {
  DEFAULT_TRACK_FILTER_CONFIG,
  applyFix,
  filterTrack,
  initialTrackFilterState,
} from './track/filter';
export { DEFAULT_MOTION_CONFIG, analyzeMotion, pointSpeeds } from './track/motion';
export type {
  AnalyzeMotionOptions,
  MotionConfig,
  MotionSummary,
  Stop,
  TimeRange,
  TimedPoint,
} from './track/motion';
export { smoothMedian } from './track/smooth';
export { simplifyTrack } from './track/simplify';
export type { SimplifyOptions } from './track/simplify';
export type {
  DropReason,
  FilteredTrack,
  FixDecision,
  GpsFix,
  TrackFilterConfig,
  TrackFilterState,
  TrackGap,
} from './track/filter';
