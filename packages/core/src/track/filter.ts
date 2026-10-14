import { haversineDistanceM, isValidLatLon } from '../geo/haversine';

/** One raw GPS fix. `ts` is milliseconds since the Unix epoch. */
export interface GpsFix {
  readonly ts: number;
  readonly lat: number;
  readonly lon: number;
  /** Horizontal accuracy radius in metres, when the device reports it. */
  readonly accuracyM?: number | undefined;
  /** Device-reported speed in m/s. Ignored by the filter; used by speed analysis (A-25). */
  readonly speedMps?: number | undefined;
}

/** Tunable thresholds of the filter. Defaults are fixed by the spec (A-01). */
export interface TrackFilterConfig {
  /** Fixes with a worse (larger) accuracy radius are dropped. */
  readonly maxAccuracyM: number;
  /** Fixes implying a faster speed than this since the last accepted fix are dropped. */
  readonly maxPlausibleSpeedMps: number;
  /** Minimum distance from the anchor for a fix to count as movement. */
  readonly minStepM: number;
  /** Fraction of the reported accuracy that also has to be exceeded to count as movement. */
  readonly accuracyStepFactor: number;
  /** A time difference strictly above this between accepted fixes is reported as a gap. */
  readonly gapAfterS: number;
}

export const DEFAULT_TRACK_FILTER_CONFIG: Readonly<TrackFilterConfig> = {
  maxAccuracyM: 30,
  maxPlausibleSpeedMps: 12,
  minStepM: 3,
  accuracyStepFactor: 0.5,
  gapAfterS: 30,
};

export type DropReason = 'invalid' | 'poor_accuracy' | 'non_monotonic' | 'speed_jump';

/** A stretch of the track with no accepted fixes, in epoch milliseconds. */
export interface TrackGap {
  readonly fromTs: number;
  readonly toTs: number;
}

export type FixDecision =
  | { readonly kind: 'dropped'; readonly reason: DropReason }
  | {
      readonly kind: 'accepted';
      /** `start`: first fix; `stationary`: inside the drift threshold; `moving`: added distance. */
      readonly motion: 'start' | 'stationary' | 'moving';
      readonly distanceDeltaM: number;
      readonly gap: TrackGap | null;
    };

/**
 * Filter state between fixes. `lastAccepted` (Q) drives time and speed checks; `anchor` (A) is the
 * last fix that added distance and drives drift suppression (see spec A-01, decision D-46).
 */
export interface TrackFilterState {
  readonly lastAccepted: GpsFix | null;
  readonly anchor: GpsFix | null;
  readonly distanceM: number;
}

export function initialTrackFilterState(): TrackFilterState {
  return { lastAccepted: null, anchor: null, distanceM: 0 };
}

function isValidFix(fix: GpsFix): boolean {
  if (!isValidLatLon(fix) || !Number.isFinite(fix.ts)) {
    return false;
  }
  return fix.accuracyM === undefined || (Number.isFinite(fix.accuracyM) && fix.accuracyM >= 0);
}

function dropped(
  state: TrackFilterState,
  reason: DropReason,
): { state: TrackFilterState; decision: FixDecision } {
  return { state, decision: { kind: 'dropped', reason } };
}

/**
 * Processes one fix. Pure: returns a new state (or the same object when the fix is dropped) and
 * the decision. Works identically for live recording and for recomputing a stored track.
 */
export function applyFix(
  state: TrackFilterState,
  fix: GpsFix,
  config: Readonly<TrackFilterConfig> = DEFAULT_TRACK_FILTER_CONFIG,
): { state: TrackFilterState; decision: FixDecision } {
  if (!isValidFix(fix)) {
    return dropped(state, 'invalid');
  }
  if (fix.accuracyM !== undefined && fix.accuracyM > config.maxAccuracyM) {
    return dropped(state, 'poor_accuracy');
  }

  const { lastAccepted, anchor } = state;
  if (lastAccepted === null || anchor === null) {
    return {
      state: { lastAccepted: fix, anchor: fix, distanceM: state.distanceM },
      decision: { kind: 'accepted', motion: 'start', distanceDeltaM: 0, gap: null },
    };
  }

  if (fix.ts <= lastAccepted.ts) {
    return dropped(state, 'non_monotonic');
  }
  const dtS = (fix.ts - lastAccepted.ts) / 1000;
  if (haversineDistanceM(lastAccepted, fix) / dtS > config.maxPlausibleSpeedMps) {
    return dropped(state, 'speed_jump');
  }

  const gap: TrackGap | null =
    dtS > config.gapAfterS ? { fromTs: lastAccepted.ts, toTs: fix.ts } : null;
  const thresholdM = Math.max(config.minStepM, config.accuracyStepFactor * (fix.accuracyM ?? 0));
  const fromAnchorM = haversineDistanceM(anchor, fix);

  if (fromAnchorM < thresholdM) {
    return {
      state: { lastAccepted: fix, anchor, distanceM: state.distanceM },
      decision: { kind: 'accepted', motion: 'stationary', distanceDeltaM: 0, gap },
    };
  }
  return {
    state: { lastAccepted: fix, anchor: fix, distanceM: state.distanceM + fromAnchorM },
    decision: { kind: 'accepted', motion: 'moving', distanceDeltaM: fromAnchorM, gap },
  };
}

export interface FilteredTrack {
  /** Accepted fixes in order, including stationary ones (the original objects, not copies). */
  readonly points: readonly GpsFix[];
  readonly distanceM: number;
  readonly gaps: readonly TrackGap[];
  /** Index into the input array and the reason, for every dropped fix. */
  readonly dropped: readonly { readonly index: number; readonly reason: DropReason }[];
}

/** Runs {@link applyFix} over a whole stored track. */
export function filterTrack(
  fixes: readonly GpsFix[],
  config: Readonly<TrackFilterConfig> = DEFAULT_TRACK_FILTER_CONFIG,
): FilteredTrack {
  const points: GpsFix[] = [];
  const gaps: TrackGap[] = [];
  const droppedFixes: { index: number; reason: DropReason }[] = [];
  let state = initialTrackFilterState();

  fixes.forEach((fix, index) => {
    const result = applyFix(state, fix, config);
    state = result.state;
    if (result.decision.kind === 'dropped') {
      droppedFixes.push({ index, reason: result.decision.reason });
      return;
    }
    points.push(fix);
    if (result.decision.gap !== null) {
      gaps.push(result.decision.gap);
    }
  });

  return { points, distanceM: state.distanceM, gaps, dropped: droppedFixes };
}
