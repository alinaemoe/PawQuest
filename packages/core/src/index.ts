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
  startSpotArrival,
  visitsByPlace,
} from './track/chronology';
export type {
  BaseArrival,
  BaseArrivalOptions,
  StartSpotOptions,
  ChronoLeg,
  ChronoPlace,
  ChronoRide,
  ChronoStep,
  ChronoVisit,
  ChronologyOptions,
} from './track/chronology';
export { findRides, rideSecondsWithin } from './track/rides';
export type { Ride, RideOptions } from './track/rides';
export {
  MIN_ROUTE_LENGTH_M,
  findRoutes,
  matchRoutes,
  passOfRoute,
  pathLength,
  routeShape,
} from './routes/routes';
export type {
  FindRoutesOptions,
  RouteCandidate,
  RouteLeg,
  RouteMatch,
  RouteMatchOptions,
} from './routes/routes';
export {
  MAX_RING_VERTICES,
  MIN_RING_AREA_M2,
  circleRing,
  distanceToRingM,
  isSimpleRing,
  pointInRing,
  ringAreaM2,
  ringBounds,
  ringCentroid,
  ringRadiusM,
  tidyRing,
} from './geo/polygon';
export type { Ring } from './geo/polygon';
export { areaCentre, overpassQuery, parseOverpassAreas } from './geo/osmAreas';
export type { MapArea } from './geo/osmAreas';
export {
  FAST_START_RATIO,
  MIN_ZONE_SHOWN_S,
  PHASE_CHANGE,
  PROFILE_WINDOW_S,
  SPEED_ZONES,
  ZONE_FROM_MPS,
  speedAt,
  speedProfile,
  speedZoneOf,
  zoneShare,
} from './track/speedProfile';
export type {
  PhasePattern,
  ProfileWindow,
  SpeedInterval,
  SpeedProfile,
  SpeedProfileOptions,
  SpeedZone,
} from './track/speedProfile';
