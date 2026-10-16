// Public API of @pawquest/insights (analytics; pure functions). Docs: docs/09-analytics-algorithms.md
export { MIN_N, OK_N, reliability } from './reliability';
export type { Reliability } from './reliability';
export { compareMedians, compareProportions, differenceLabel } from './compare';
export type { BinaryGroup, Comparison, DifferenceLabel, MedianComparisonOptions } from './compare';
export { mulberry32 } from './random';
export {
  DAILY_PAW_CAP,
  MAX_ATTEMPT_PAWS_PER_SESSION,
  MAX_EVENT_PAWS_PER_WALK,
  PAW_LEVELS,
  attemptPaws,
  eventPaws,
  grantPaws,
  pawLevel,
} from './paws';
export type { PawLevel, PawLevelKey } from './paws';
export { PAUSES_PER_WEEK, computeStreak, recordDays } from './streak';
export type { StreakOptions, StreakResult } from './streak';
export { benjaminiHochberg, coOccurrences, patternCards, patternKey } from './patterns';
export type {
  AnalysisUnit,
  CoOccurrence,
  CoOccurrenceOptions,
  GroupCount,
  PatternCard,
  PatternCardOptions,
} from './patterns';
export {
  HIGH_LOAD_PERCENTILE,
  LOAD_WINDOW_DAYS,
  MIN_LOAD_DAYS,
  dailyLoads,
  isHighLoad,
  loadPercentile,
  reactionMultiplier,
} from './load';
export type { DailyLoadOptions, DayLoad, LoadEvent, LoadPercentile } from './load';
export { levelReadiness, practiceGap } from './skills';
export type { LevelAttempt, LevelReadiness, Moment, NotReadyReason, PracticeGap } from './skills';
export { assertFinite, localDay } from './time';
export { MIN_TREND_POINTS, analyzeTrend, mannKendallZ, theilSenSlope, trendLabel } from './trend';
export type { SeriesPoint, TrendDirection, TrendLabel, TrendResult } from './trend';
export { MIN_PER_WEEK, weekIndex, weeklySeries } from './weekly';
export type { DatedValue } from './weekly';
export { countSuccesses, wilsonInterval } from './proportion';
export type { AttemptResult, PartialPolicy, ProportionInterval } from './proportion';
export { addMonths, dueStatus, inSeason, intervalStats, nextDue, reminderTimes } from './care';
export type { CareSchedule, DueKind, DueStatus, IntervalStats } from './care';
export {
  WALK_DIMENSIONS_VERSION,
  WALK_DIMENSION_KEYS,
  WALK_OUTCOME_KEYS,
  timeOfDayOf,
  walkDimensions,
  walkOutcomes,
} from './dimensions';
export type { Dimensions, Outcomes, WalkDimensionInput, WalkOutcomeInput } from './dimensions';
export { checkCard, stratifiedDelta } from './adjust';
export type { Adjustment, AdjustmentStatus, AdjustOptions } from './adjust';
export { checkedPatternCards } from './checked';
export type { CheckedCard, CheckedCards, CheckedOptions } from './checked';
export { DIMENSION_FAMILIES, contextDimensions } from './dimensions';
export {
  PRELIMINARY,
  PRELIMINARY_FALSE_RATE_PERCENT,
  preliminaryApplies,
  preliminaryCards,
} from './preliminary';
export type { PreliminaryCard } from './preliminary';
export { MIN_WALKS_FOR_FAVOURITES, MIN_WALKS_FOR_RECORDS, computeFacts, weekdayOf } from './facts';
export type { BusiestWeek, DayStreak, FactWalk, Facts, Favourite, Record1 } from './facts';
export {
  MIN_SIMILAR,
  SIMILAR_WALK_LEVELS,
  SIMILAR_WEATHER_LEVELS,
  compareToUsual,
  similarWalks,
  usualStats,
} from './similar';
export type {
  SimilarResult,
  SimilarWalk,
  SimilarityLevel,
  UsualComparison,
  UsualRule,
  UsualStats,
} from './similar';
export { CALENDAR_BANDS_S, calendarDays, calendarWeeks, dayLevel, mondayOf } from './calendar';
export type { CalendarDay, CalendarWalk, CalendarWeek } from './calendar';
export { comparePeriods } from './periods';
export type { ComparisonKey, ComparisonRow, PeriodWalk } from './periods';
export { groupShares, groupSpreads, weeklyBars } from './charts';
export type { ChartUnit, ChartWalk, ShareBar, SpreadBar, WeekBar } from './charts';
export {
  BUCKET_METERS,
  MIN_WEEK_EVENTS,
  reactionDistanceSeries,
  recoverySeries,
  type ReactionEvent,
  type RecoveryEvent,
  type RecoverySeries,
  type WeekPoint,
  type WeeklySeries,
} from './thresholds';
