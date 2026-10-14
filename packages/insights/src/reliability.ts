/** Below this many observations in the smaller group nothing is concluded (spec A-00). */
export const MIN_N = 5;
/** From this many observations on no "preliminary" caveat is shown (spec A-00). */
export const OK_N = 10;

export type Reliability = 'insufficient' | 'preliminary' | 'ok';

/**
 * Reliability label for a sample (spec A-00). `n` is the size of the smallest group involved.
 *
 * @throws RangeError if `n` is not a finite number >= 0.
 */
export function reliability(n: number): Reliability {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError('n must be a finite number >= 0');
  }
  if (n < MIN_N) {
    return 'insufficient';
  }
  return n < OK_N ? 'preliminary' : 'ok';
}
