import { checkedPatternCards, type CheckedCard, type CheckedOptions } from './checked';
import type { AnalysisUnit } from './patterns';

/**
 * The preliminary mode (docs/23, step 3.3): what a small number of walks can honestly say.
 *
 * With few walks the careful rules of the main mode (at least five walks in each group, a
 * strict correction for the number of comparisons, a 20-point difference) stay silent for weeks.
 * This mode looks at the same dimensions with looser rules (four walks in a group, a 30-point
 * difference, a correction that tolerates half of the findings being flukes) and shows only
 * **observations**: counts,
 * "4 of 5 against 1 of 12", labelled "very preliminary" and with the measured chance that such a
 * card is a fluke. It is a separate section, never mixed with the findings, and it is switched off
 * when there are too few walks to say anything and once there are enough for the main mode.
 */
export const PRELIMINARY = {
  /** Fewest walks with a known outcome for the mode to show anything. */
  minUnits: 15,
  /** From this many walks on the main mode takes over (it finds strong effects most of the time). */
  maxUnits: 59,
  minGroup: 4,
  /** At least this big a difference of shares (30 points). */
  minAbsDelta: 0.3,
  /** The share of false findings the correction tolerates: 0.5 here, 0.2 in the main mode. */
  fdr: 0.5,
  maxCards: 3,
} as const;

/**
 * How often a nothing-but-chance set of walks still gets a preliminary card, in percent, as measured
 * by the simulation in `preliminary.test.ts` (the test fails when the real rate climbs above it, so
 * the sentence on the screen stays true).
 */
export const PRELIMINARY_FALSE_RATE_PERCENT = 30;

export interface PreliminaryCard extends CheckedCard {
  readonly preliminary: true;
}

/** Whether there are enough walks for the mode to speak, and not so many that the main mode should. */
export function preliminaryApplies(unitCount: number): boolean {
  return unitCount >= PRELIMINARY.minUnits && unitCount <= PRELIMINARY.maxUnits;
}

/**
 * Observations from a small number of walks. Nothing is returned outside the range of walks the
 * mode is meant for; patterns another dimension explains are left out (the check still runs, but
 * with so few walks it often cannot, and then the card says "not checked").
 */
export function preliminaryCards(
  units: readonly AnalysisUnit[],
  dimensions: readonly string[],
  outcomes: readonly string[],
  options: Pick<CheckedOptions, 'excludeKeys' | 'contexts' | 'adjust'> = {},
): PreliminaryCard[] {
  if (!preliminaryApplies(units.length)) {
    return [];
  }
  return checkedPatternCards(units, dimensions, outcomes, {
    ...options,
    minGroup: PRELIMINARY.minGroup,
    minAbsDelta: PRELIMINARY.minAbsDelta,
    fdr: PRELIMINARY.fdr,
    maxCards: PRELIMINARY.maxCards,
    adjust: { ...options.adjust, minUnits: 6 },
  }).cards.map((card) => ({ ...card, preliminary: true }));
}
