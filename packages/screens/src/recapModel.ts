export interface RecapDelta {
  readonly kind: 'none' | 'same' | 'more' | 'less';
  /** How far apart the two weeks are, in meters (always positive). */
  readonly distanceM: number;
}

/** Below this the two weeks are told to be "the same". */
const SAME_FLOOR_M = 200;
const SAME_SHARE = 0.05;

/** This week's distance against the week before it, in words the card can use. */
export function recapDelta(currentM: number, previousM: number, previousCount: number): RecapDelta {
  if (previousCount === 0) {
    return { kind: 'none', distanceM: 0 };
  }
  const diff = currentM - previousM;
  const size = Math.abs(diff);
  if (size < Math.max(SAME_FLOOR_M, previousM * SAME_SHARE)) {
    return { kind: 'same', distanceM: 0 };
  }
  return { kind: diff > 0 ? 'more' : 'less', distanceM: size };
}
