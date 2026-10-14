/**
 * Median of a list of numbers; for an even count, the mean of the two middle values.
 * Does not modify its input.
 *
 * @throws RangeError for an empty list.
 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid];
  if (hi === undefined) {
    throw new RangeError('median of an empty list');
  }
  const lo = sorted[mid - 1];
  return sorted.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2;
}
