import { checkCard, type Adjustment, type AdjustOptions } from './adjust';
import { contextDimensions } from './dimensions';
import {
  patternCards,
  type AnalysisUnit,
  type PatternCard,
  type PatternCardOptions,
} from './patterns';

export interface CheckedCard extends PatternCard {
  readonly adjustment: Adjustment;
}

export interface CheckedCards {
  /** Patterns that hold when the other dimensions are held still, or could not be checked. */
  readonly cards: readonly CheckedCard[];
  /** Patterns that another dimension explains ("it is the place, not the weather"). */
  readonly explained: readonly CheckedCard[];
}

export interface CheckedOptions extends PatternCardOptions {
  /** What a dimension is checked against; the other families by default. */
  readonly contexts?: (dimension: string) => readonly string[];
  readonly adjust?: AdjustOptions;
}

/**
 * Pattern cards that were also checked against the other dimensions (A-32): the ones another
 * dimension explains are left out of the list and returned apart, so the owner can be told
 * "this looks like the weather but it is the place" instead of being shown a wrong cause.
 */
export function checkedPatternCards(
  units: readonly AnalysisUnit[],
  dimensions: readonly string[],
  outcomes: readonly string[],
  options: CheckedOptions = {},
): CheckedCards {
  const contexts = options.contexts ?? contextDimensions;
  const memo = new Map<string, Adjustment>();
  const adjustmentOf = (card: Omit<PatternCard, 'testedCount'>): Adjustment => {
    const known = memo.get(card.key);
    if (known !== undefined) {
      return known;
    }
    const found = checkCard(units, card, contexts(card.dimension), options.adjust);
    memo.set(card.key, found);
    return found;
  };
  // the options of the card search itself: without the ones this function owns
  const base: PatternCardOptions = {
    ...(options.excludeKeys === undefined ? {} : { excludeKeys: options.excludeKeys }),
    ...(options.fdr === undefined ? {} : { fdr: options.fdr }),
    ...(options.minAbsDelta === undefined ? {} : { minAbsDelta: options.minAbsDelta }),
    ...(options.maxCards === undefined ? {} : { maxCards: options.maxCards }),
  };
  const attach = (card: PatternCard): CheckedCard => ({ ...card, adjustment: adjustmentOf(card) });
  return {
    cards: patternCards(units, dimensions, outcomes, {
      ...base,
      accept: (card) => adjustmentOf(card).status !== 'confounded',
    }).map(attach),
    explained: patternCards(units, dimensions, outcomes, {
      ...base,
      maxCards: 50,
      accept: (card) => adjustmentOf(card).status === 'confounded',
    }).map(attach),
  };
}
