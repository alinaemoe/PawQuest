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
export {
  MIN_PACE_DISTANCE_M,
  averagePaceMinPerKm,
  currentSpeedMps,
  paceFromSpeedMinPerKm,
} from './track/pace';
export { gapRanges, movingTimeAxis, positionAt } from './track/replay';
export type { PlaybackOptions, ReplayPoint, TimeAxis } from './track/replay';
export { median } from './util/median';
export { dbscan } from './geo/dbscan';
export type { DbscanResult } from './geo/dbscan';
export {
  defaultPlaceName,
  findDuplicates,
  guessCategory,
  nameKey,
  nameSimilarity,
  tidyName,
} from './places/names';
export type {
  DuplicateCandidate,
  FindDuplicatesOptions,
  InferredCategory,
  LibraryPlace,
} from './places/names';
export { suggestPlaces } from './places/suggest';
export type {
  PlaceSuggestion,
  SavedPlace,
  StopInput,
  SuggestPlacesOptions,
} from './places/suggest';
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
export { DEFAULT_STAY_SCALES, findStays } from './track/stays';
export type { Stay, StayOptions, StayPoint, StayScale, StayScaleName } from './track/stays';
export { clusterStays } from './places/stayClusters';
export type { ClusterStaysOptions, StayCluster, StayInput } from './places/stayClusters';
export {
  baseArrival,
  buildChronology,
  chronologyTitle,
  forgottenBaseStay,
  placeContaining,
  visitsByPlace,
} from './track/chronology';
export type {
  BaseArrival,
  BaseArrivalOptions,
  ChronoLeg,
  ChronoPlace,
  ChronoRide,
  ChronoStep,
  ChronoVisit,
  ChronologyOptions,
} from './track/chronology';
export { findRides, rideSecondsWithin } from './track/rides';
export type { Ride, RideOptions } from './track/rides';
