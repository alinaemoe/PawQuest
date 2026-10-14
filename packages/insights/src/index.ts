// Public API of @pawquest/insights (analytics; pure functions). Docs: docs/09-analytics-algorithms.md
export { MIN_N, OK_N, reliability } from './reliability';
export type { Reliability } from './reliability';
export { compareMedians, compareProportions, differenceLabel } from './compare';
export type { BinaryGroup, Comparison, DifferenceLabel, MedianComparisonOptions } from './compare';
export { mulberry32 } from './random';
export { countSuccesses, wilsonInterval } from './proportion';
export type { AttemptResult, PartialPolicy, ProportionInterval } from './proportion';
