const DAY_MS = 86_400_000;

/**
 * Local calendar day as the number of days since 1970-01-01, given the UTC offset in minutes at
 * the moment of recording. Using the stored offset keeps "which day was it for the owner" stable.
 */
export function localDay(ts: number, tzOffsetMin: number): number {
  return Math.floor((ts + tzOffsetMin * 60_000) / DAY_MS);
}

/** Throws a RangeError if any of the numbers is not finite. */
export function assertFinite(label: string, ...values: readonly number[]): void {
  if (!values.every((v) => Number.isFinite(v))) {
    throw new RangeError(`${label} must be finite numbers`);
  }
}
