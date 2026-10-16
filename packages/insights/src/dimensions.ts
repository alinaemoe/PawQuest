/**
 * What a walk can be compared by (docs/21, A-31) and what can be counted as its outcome. Bands and
 * names are fixed here and in the tests: changing one changes what old walks are compared by, so a
 * change must raise `WALK_DIMENSIONS_VERSION` (the stored derived data is then made again).
 */
export const WALK_DIMENSIONS_VERSION = 1;

export type Dimensions = Readonly<Record<string, string | undefined>>;
export type Outcomes = Readonly<Record<string, boolean | undefined>>;

export interface WalkDimensionInput {
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  readonly durationS: number | null;
  /** Category of the place of the walk (park, yard, ...), when it has one. */
  readonly placeCategory: string | null;
  /** Radius of that place in meters, or the radius of a circle of the same area for a contour. */
  readonly placeRadiusM: number | null;
  /** Category of the saved place the walk began in and ended in; null when none (or unknown). */
  readonly startPlaceCategory: string | null;
  readonly endPlaceCategory: string | null;
  /** Whether the walk went into a shop: null when unknown (no track). */
  readonly shopVisit: boolean | null;
  /** Seconds spent riding inside the walk. */
  readonly rideS: number;
  /** True when the track was recorded (so the places at the ends can be told). */
  readonly hasTrack: boolean;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** morning 5-11, day 11-17, evening 17-22, night 22-5 (local time). */
export function timeOfDayOf(ts: number, tzOffsetMin: number): string {
  const hour = Math.floor(((((ts + tzOffsetMin * 60_000) % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS);
  if (hour >= 5 && hour < 11) {
    return 'morning';
  }
  if (hour >= 11 && hour < 17) {
    return 'day';
  }
  return hour >= 17 && hour < 22 ? 'evening' : 'night';
}

function dayType(ts: number, tzOffsetMin: number): string {
  const days = Math.floor((ts + tzOffsetMin * 60_000) / DAY_MS);
  // 1970-01-01 was a Thursday: 0 = Monday
  const weekday = (((days + 3) % 7) + 7) % 7;
  return weekday >= 5 ? 'weekend' : 'weekday';
}

function durationBand(seconds: number | null): string | undefined {
  if (seconds === null) {
    return undefined;
  }
  const minutes = seconds / 60;
  return minutes < 20 ? 'under_20' : minutes < 45 ? '20_45' : minutes < 90 ? '45_90' : 'over_90';
}

const GROUPS: Readonly<Record<string, string>> = {
  park: 'green',
  forest: 'green',
  meadow: 'green',
  alley: 'green',
  square: 'green',
  dog_area: 'green',
  yard: 'streets',
  district: 'streets',
  quiet_street: 'streets',
  busy_street: 'streets',
  waterfront: 'water',
  shop: 'errands',
  vet: 'errands',
  grooming: 'errands',
  home: 'base',
  guests: 'base',
};

function sizeBand(radiusM: number | null): string | undefined {
  if (radiusM === null) {
    return undefined;
  }
  return radiusM <= 60 ? 'small' : radiusM <= 250 ? 'medium' : 'large';
}

const isBase = (category: string | null): boolean => category === 'home' || category === 'guests';

function walkType(input: WalkDimensionInput): string | undefined {
  if (!input.hasTrack) {
    return undefined;
  }
  const start = isBase(input.startPlaceCategory);
  const end = isBase(input.endPlaceCategory);
  if (start && end) {
    return 'base_to_base';
  }
  return start ? 'from_base' : end ? 'to_base' : 'other';
}

/** The categories of one walk; a value is missing when it cannot be told. */
export interface WalkDims {
  readonly time_of_day: string;
  readonly day_type: string;
  readonly duration: string | undefined;
  readonly place_kind: string | undefined;
  readonly place_size: string | undefined;
  readonly walk_type: string | undefined;
  readonly shop_visit: string | undefined;
  readonly ride: string | undefined;
}

/** The categories of one walk (without the weather: that is `weatherDimensions`). */
export function walkDimensions(input: WalkDimensionInput): WalkDims {
  return {
    time_of_day: timeOfDayOf(input.startedAt, input.tzOffsetMin),
    day_type: dayType(input.startedAt, input.tzOffsetMin),
    duration: durationBand(input.durationS),
    place_kind: input.placeCategory === null ? undefined : GROUPS[input.placeCategory],
    place_size: sizeBand(input.placeRadiusM),
    walk_type: walkType(input),
    shop_visit: input.shopVisit === null ? undefined : input.shopVisit ? 'yes' : 'no',
    ride: input.hasTrack ? (input.rideS >= 60 ? 'yes' : 'no') : undefined,
  };
}

export interface WalkOutcomeInput {
  /** The number of events of the walk by what they mean. */
  readonly events: number;
  readonly hard: number;
  readonly success: number;
  /** Reactions (1-5) given to the events of the walk; events without one are not in the list. */
  readonly reactions: readonly number[];
  /** The owner finished the summary of the walk (so "nothing happened" is a fact, not a gap). */
  readonly summaryDone: boolean;
}

/** What happened on the walk, as yes/no; a value is missing when it is not known. */
export interface WalkOutcomes {
  readonly hard_moment: boolean | undefined;
  readonly success: boolean | undefined;
  readonly strong_reaction: boolean | undefined;
}

/**
 * What happened on the walk, as yes/no. A walk nothing was recorded for and whose summary was not
 * finished tells nothing about "no hard moments": its outcomes are left undefined and it does not
 * take part in those comparisons (honest statistics, G-19).
 */
export function walkOutcomes(input: WalkOutcomeInput): WalkOutcomes {
  const observed = input.events > 0 || input.summaryDone;
  return {
    hard_moment: observed ? input.hard > 0 : undefined,
    success: observed ? input.success > 0 : undefined,
    strong_reaction: input.reactions.length === 0 ? undefined : input.reactions.some((r) => r >= 3),
  };
}

/** The dimensions a pattern card may be built from, and the outcomes it may be about. */
export const WALK_DIMENSION_KEYS = [
  'time_of_day',
  'day_type',
  'duration',
  'place_kind',
  'place_size',
  'walk_type',
  'shop_visit',
  'ride',
  'ground',
  'rain_recency',
  'temp',
  'wind',
  'light',
  'air',
  'pollen',
  'paw_heat',
] as const;

export const WALK_OUTCOME_KEYS = ['hard_moment', 'success', 'strong_reaction'] as const;

/**
 * Dimensions that belong together. A pattern in one family is checked against the other families
 * (is it the weather or the place?), never against its own: wet ground and "rained within three
 * hours" are one cause seen twice, not two causes.
 */
export const DIMENSION_FAMILIES = {
  weather: ['ground', 'rain_recency', 'temp', 'wind', 'light', 'air', 'pollen', 'paw_heat'],
  place: ['place_kind', 'place_size', 'walk_type', 'shop_visit', 'ride'],
  time: ['time_of_day', 'day_type', 'duration'],
} as const;

/** The dimensions a pattern in `dimension` is to be checked against: all of the other families. */
export function contextDimensions(dimension: string): string[] {
  const own = Object.values(DIMENSION_FAMILIES).find((family) =>
    (family as readonly string[]).includes(dimension),
  );
  return Object.values(DIMENSION_FAMILIES)
    .filter((family) => family !== own)
    .flatMap((family) => [...family]);
}
