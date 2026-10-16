import { describe, expect, it } from 'vitest';

import { checkedPatternCards } from './checked';
import { WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS } from './dimensions';
import type { AnalysisUnit } from './patterns';
import {
  PRELIMINARY,
  PRELIMINARY_FALSE_RATE_PERCENT,
  preliminaryApplies,
  preliminaryCards,
} from './preliminary';
import { mulberry32 } from './random';

function walks(count: number, seed: number, pEvening: number, pMorning: number): AnalysisUnit[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const dims: Record<string, string> = {};
    for (const key of WALK_DIMENSION_KEYS) {
      dims[key] = `v${String(Math.floor(rand() * 3))}`;
    }
    const evening = rand() < 0.4;
    dims['time_of_day'] = evening ? 'evening' : 'morning';
    return {
      id: `u${String(i)}`,
      dims,
      outcomes: { hard_moment: rand() < (evening ? pEvening : pMorning) },
    };
  });
}

const cardsOf = (data: AnalysisUnit[]) =>
  preliminaryCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS);

describe('preliminaryApplies', () => {
  it('only between the fewest walks that can say anything and where the main mode takes over', () => {
    expect([14, 15, 30, 59, 60, 0].map(preliminaryApplies)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(PRELIMINARY.minUnits).toBeLessThan(PRELIMINARY.maxUnits);
  });
});

describe('preliminaryCards', () => {
  it('says nothing outside its range of walks', () => {
    expect(cardsOf(walks(10, 1, 0.9, 0.05))).toEqual([]);
    expect(cardsOf(walks(80, 1, 0.9, 0.05))).toEqual([]);
  });

  it('with a clear difference in 45 walks it shows an observation, marked preliminary', () => {
    let found = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const cards = cardsOf(walks(45, seed, 0.75, 0.1));
      const card = cards.find((c) => c.dimension === 'time_of_day');
      if (card !== undefined) {
        found += 1;
        expect(card.preliminary).toBe(true);
        expect(Math.min(card.inCondition.n, card.rest.n)).toBeGreaterThanOrEqual(
          PRELIMINARY.minGroup,
        );
        expect(Math.abs(card.delta)).toBeGreaterThanOrEqual(PRELIMINARY.minAbsDelta);
      }
    }
    expect(found).toBeGreaterThanOrEqual(14);
  });

  it('never more cards than the mode allows, and the hidden keys are left out', () => {
    const data = walks(45, 3, 0.75, 0.1);
    const cards = cardsOf(data);
    expect(cards.length).toBeLessThanOrEqual(PRELIMINARY.maxCards);
    const first = cards[0]?.key ?? '';
    const without = preliminaryCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS, {
      excludeKeys: new Set([first]),
    });
    expect(without.map((c) => c.key)).not.toContain(first);
  });
});

describe('the stated chance of a fluke is true (simulation)', () => {
  it('with nothing going on, a card appears in no more than the stated share of the sets', () => {
    for (const count of [20, 30, 45]) {
      let withCards = 0;
      const runs = 150;
      for (let seed = 1; seed <= runs; seed += 1) {
        if (cardsOf(walks(count, seed, 0.3, 0.3)).length > 0) {
          withCards += 1;
        }
      }
      expect((withCards / runs) * 100).toBeLessThanOrEqual(PRELIMINARY_FALSE_RATE_PERCENT);
    }
  });

  it('it is more attentive than the main mode where the main mode is still silent, and not much noisier', () => {
    let early = 0;
    let main = 0;
    const runs = 150;
    for (let seed = 1; seed <= runs; seed += 1) {
      const data = walks(35, seed, 0.6, 0.15);
      if (cardsOf(data).some((c) => c.dimension === 'time_of_day')) {
        early += 1;
      }
      if (
        checkedPatternCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS).cards.some(
          (c) => c.dimension === 'time_of_day',
        )
      ) {
        main += 1;
      }
    }
    expect(early).toBeGreaterThan(main);
    expect(early / runs).toBeGreaterThan(0.5);
  });
});
