// Public API of @pawquest/insights (analytics; pure functions). Docs: docs/09-analytics-algorithms.md
export { MIN_N, OK_N, reliability } from './reliability';
export type { Reliability } from './reliability';
export { compareMedians, compareProportions, differenceLabel } from './compare';
export type { BinaryGroup, Comparison, DifferenceLabel, MedianComparisonOptions } from './compare';
export { mulberry32 } from './random';
export { MIN_TREND_POINTS, analyzeTrend, mannKendallZ, theilSenSlope, trendLabel } from './trend';
export type { SeriesPoint, TrendDirection, TrendLabel, TrendResult } from './trend';
export { MIN_PER_WEEK, weekIndex, weeklySeries } from './weekly';
export type { DatedValue } from './weekly';
export { countSuccesses, wilsonInterval } from './proportion';
export type { AttemptResult, PartialPolicy, ProportionInterval } from './proportion';
