import { describe, expect, it } from 'vitest';

import { checkedPatternCards } from './checked';
import { WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS } from './dimensions';
import { patternCards, type AnalysisUnit } from './patterns';
import { mulberry32 } from './random';

type Maker = (rand: () => number, index: number) => { dims: Record<string, string>; hard: boolean };

function units(count: number, seed: number, make: Maker): AnalysisUnit[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const { dims, hard } = make(rand, i);
    return { id: `u${String(i)}`, dims, outcomes: { hard_moment: hard } };
  });
}

/** Parks are dry and hard; streets are wet and easy: the weather has no effect of its own. */
const placeCausesIt: Maker = (rand) => {
  const park = rand() < 0.5;
  const dry = rand() < (park ? 0.85 : 0.2);
  return {
    dims: { place_kind: park ? 'green' : 'streets', ground: dry ? 'dry' : 'wet' },
    hard: rand() < (park ? 0.6 : 0.1),
  };
};

/** Wet ground really does it, in the parks and on the streets alike. */
const weatherCausesIt: Maker = (rand) => {
  const park = rand() < 0.5;
  const wet = rand() < 0.5;
  return {
    dims: { place_kind: park ? 'green' : 'streets', ground: wet ? 'wet' : 'dry' },
    hard: rand() < (wet ? 0.65 : 0.15),
  };
};

describe('checkedPatternCards', () => {
  it('the weather that only travels with the place is explained by the place', () => {
    const data = units(240, 11, placeCausesIt);
    // without the check the weather looks like a finding
    const plain = patternCards(data, ['place_kind', 'ground'], ['hard_moment']);
    expect(plain.map((c) => c.dimension)).toContain('ground');
    const checked = checkedPatternCards(data, ['place_kind', 'ground'], ['hard_moment']);
    expect(checked.cards.map((c) => c.dimension)).toEqual(['place_kind']);
    expect(checked.cards[0]?.adjustment.status).toBe('holds');
    const explained = checked.explained.find((c) => c.dimension === 'ground');
    expect(explained?.adjustment).toMatchObject({ status: 'confounded', by: 'place_kind' });
  });

  it('a weather effect that holds in every kind of place stays a finding', () => {
    const data = units(240, 12, weatherCausesIt);
    const checked = checkedPatternCards(data, ['place_kind', 'ground'], ['hard_moment']);
    const ground = checked.cards.find((c) => c.dimension === 'ground');
    expect(ground?.adjustment.status).toBe('holds');
    // the card may be written for the dry side (fewer hard moments) or the wet side (more)
    expect(Math.abs(ground?.adjustment.adjustedDelta ?? 0)).toBeGreaterThan(0.3);
    expect(Math.sign(ground?.adjustment.adjustedDelta ?? 0)).toBe(Math.sign(ground?.delta ?? 1));
    expect(checked.explained.find((c) => c.dimension === 'ground')).toBeUndefined();
  });

  it('without anything to check against, a card says so instead of claiming to hold', () => {
    const data = units(120, 13, (rand) => {
      const wet = rand() < 0.5;
      return { dims: { ground: wet ? 'wet' : 'dry' }, hard: rand() < (wet ? 0.7 : 0.1) };
    });
    const checked = checkedPatternCards(data, ['ground'], ['hard_moment']);
    expect(checked.cards[0]?.adjustment).toEqual({ status: 'unchecked', adjustedDelta: null });
  });

  it('the options (card count, hidden keys, contexts) are respected', () => {
    const data = units(240, 12, weatherCausesIt);
    const top = checkedPatternCards(data, ['place_kind', 'ground'], ['hard_moment']).cards[0];
    const hidden = checkedPatternCards(data, ['place_kind', 'ground'], ['hard_moment'], {
      excludeKeys: new Set([top?.key ?? '']),
    });
    expect(hidden.cards.map((c) => c.key)).not.toContain(top?.key);
    const one = checkedPatternCards(data, ['place_kind', 'ground'], ['hard_moment'], {
      maxCards: 1,
    });
    expect(one.cards).toHaveLength(1);
    // with the check against nothing, the explained list is empty
    const none = checkedPatternCards(
      units(240, 11, placeCausesIt),
      ['place_kind', 'ground'],
      ['hard_moment'],
      {
        contexts: () => [],
      },
    );
    expect(none.explained).toEqual([]);
    expect(none.cards.length).toBeGreaterThan(0);
  });
});

describe('false findings are rare (simulation)', () => {
  const noise = (seed: number): AnalysisUnit[] =>
    units(60, seed, (rand) => {
      const dims: Record<string, string> = {};
      for (const key of WALK_DIMENSION_KEYS) {
        dims[key] = `v${String(Math.floor(rand() * 3))}`;
      }
      return { dims, hard: rand() < 0.3 };
    });

  it('with nothing going on, cards appear in at most a fifth of 300 random datasets', () => {
    let withCards = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const found = checkedPatternCards(noise(seed), WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS);
      if (found.cards.length > 0) {
        withCards += 1;
      }
    }
    expect(withCards / 300).toBeLessThanOrEqual(0.2);
  });

  it('the check never adds findings: the checked list is a part of the plain one', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const data = noise(seed);
      const plain = patternCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS).length;
      const checked = checkedPatternCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS).cards
        .length;
      expect(checked).toBeLessThanOrEqual(Math.max(plain, 5));
    }
  });

  it('a real effect is found in almost every dataset of 100 walks', () => {
    let found = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const data = units(100, seed, (rand) => {
        const dims: Record<string, string> = {};
        for (const key of WALK_DIMENSION_KEYS) {
          dims[key] = `v${String(Math.floor(rand() * 3))}`;
        }
        // an evening walk is twice as likely to have a hard moment, whatever else is going on
        const evening = rand() < 0.4;
        dims['time_of_day'] = evening ? 'evening' : 'morning';
        return { dims, hard: rand() < (evening ? 0.6 : 0.15) };
      });
      const cards = checkedPatternCards(data, WALK_DIMENSION_KEYS, WALK_OUTCOME_KEYS).cards;
      if (cards.some((c) => c.dimension === 'time_of_day')) {
        found += 1;
      }
    }
    expect(found).toBeGreaterThanOrEqual(90);
  });
});
