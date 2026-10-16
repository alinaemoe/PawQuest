import { describe, expect, it } from 'vitest';

import { checkCard, stratifiedDelta } from './adjust';
import { DIMENSION_FAMILIES, contextDimensions } from './dimensions';
import type { AnalysisUnit } from './patterns';

/** Units from a table: [group value, stratum, outcome yes, count]. */
function table(rows: readonly (readonly [string, string, number, number])[]): AnalysisUnit[] {
  const units: AnalysisUnit[] = [];
  let id = 0;
  for (const [group, stratum, yes, count] of rows) {
    for (let i = 0; i < count; i += 1) {
      units.push({
        id: String(id++),
        dims: { group, stratum },
        outcomes: { hard: i < yes },
      });
    }
  }
  return units;
}

describe('stratifiedDelta', () => {
  it('equals the plain difference when the strata agree', () => {
    // in both strata the group has 50 % and the rest 20 %
    const units = table([
      ['a', 's1', 5, 10],
      ['b', 's1', 4, 20],
      ['a', 's2', 10, 20],
      ['b', 's2', 2, 10],
    ]);
    expect(stratifiedDelta(units, 'group', 'a', 'hard', 'stratum')).toBeCloseTo(0.3, 5);
  });

  it('the plain difference can be reversed inside the levels (Simpson)', () => {
    // group a is mostly in the hard stratum s2 (many yes anyway); inside each stratum a is lower
    const units = table([
      ['a', 's1', 1, 10], // 10 %
      ['b', 's1', 3, 30], // 10 %... equal
      ['a', 's2', 28, 50], // 56 %
      ['b', 's2', 6, 10], // 60 %
    ]);
    const crude = units.filter((u) => u.dims['group'] === 'a');
    const yesA = crude.filter((u) => u.outcomes['hard'] === true).length / crude.length;
    const rest = units.filter((u) => u.dims['group'] === 'b');
    const yesB = rest.filter((u) => u.outcomes['hard'] === true).length / rest.length;
    expect(yesA).toBeGreaterThan(yesB); // plain: a looks worse
    expect(stratifiedDelta(units, 'group', 'a', 'hard', 'stratum')).toBeLessThan(0); // within levels: it is not
  });

  it('cannot be told with one level, or with too few units', () => {
    const one = table([
      ['a', 's1', 5, 10],
      ['b', 's1', 2, 10],
    ]);
    expect(stratifiedDelta(one, 'group', 'a', 'hard', 'stratum')).toBeNull();
    const few = table([
      ['a', 's1', 1, 2],
      ['b', 's1', 1, 2],
      ['a', 's2', 1, 2],
      ['b', 's2', 0, 2],
    ]);
    expect(stratifiedDelta(few, 'group', 'a', 'hard', 'stratum')).toBeNull();
    expect(stratifiedDelta(few, 'group', 'a', 'hard', 'stratum', 4)).not.toBeNull();
  });

  it('a level where one of the two groups is missing says nothing and is left out', () => {
    const units = table([
      ['a', 's1', 5, 10],
      ['b', 's1', 2, 10],
      ['a', 's2', 6, 10],
      ['b', 's2', 3, 10],
      ['a', 's3', 9, 10], // no "b" here
    ]);
    const delta = stratifiedDelta(units, 'group', 'a', 'hard', 'stratum');
    expect(delta).toBeCloseTo(0.3, 5);
  });

  it('units without the dimension, the context or the outcome are not counted', () => {
    const units = [
      ...table([
        ['a', 's1', 5, 10],
        ['b', 's1', 2, 10],
        ['a', 's2', 5, 10],
        ['b', 's2', 2, 10],
      ]),
      { id: 'x', dims: { group: 'a' }, outcomes: { hard: true } },
      { id: 'y', dims: { group: 'a', stratum: 's1' }, outcomes: {} },
    ];
    expect(stratifiedDelta(units, 'group', 'a', 'hard', 'stratum')).toBeCloseTo(0.3, 5);
  });
});

describe('checkCard', () => {
  const card = { dimension: 'group', value: 'a', outcome: 'hard', delta: 0.3 };

  it('holds when the difference stays inside the levels', () => {
    const units = table([
      ['a', 's1', 5, 10],
      ['b', 's1', 2, 10],
      ['a', 's2', 5, 10],
      ['b', 's2', 2, 10],
    ]);
    const result = checkCard(units, card, ['stratum']);
    expect(result.status).toBe('holds');
    expect(result.adjustedDelta).toBeCloseTo(0.3, 5);
  });

  it('is confounded when the difference all but disappears inside the levels, and names the level dimension', () => {
    const units = table([
      ['a', 's1', 1, 10],
      ['b', 's1', 3, 30],
      ['a', 's2', 28, 50],
      ['b', 's2', 6, 10],
    ]);
    const result = checkCard(units, { ...card, delta: 0.3 }, ['stratum']);
    expect(result).toMatchObject({ status: 'confounded', by: 'stratum' });
  });

  it('half of the difference is the edge: just above holds, just below is confounded', () => {
    const make = (yesA: number) =>
      table([
        ['a', 's1', yesA, 10],
        ['b', 's1', 2, 10],
        ['a', 's2', yesA, 10],
        ['b', 's2', 2, 10],
      ]);
    // plain delta given as 0.4: within levels 0.4 (yesA 6) holds; 0.15 (yesA 3.5 -> use 4: 0.2) is exactly half
    expect(checkCard(make(6), { ...card, delta: 0.4 }, ['stratum']).status).toBe('holds');
    expect(checkCard(make(4), { ...card, delta: 0.4 }, ['stratum']).status).toBe('holds'); // 0.2 = half
    expect(checkCard(make(3), { ...card, delta: 0.4 }, ['stratum']).status).toBe('confounded'); // 0.1
  });

  it('a reversed sign is confounded', () => {
    const units = table([
      ['a', 's1', 1, 10],
      ['b', 's1', 4, 10],
      ['a', 's2', 1, 10],
      ['b', 's2', 4, 10],
    ]);
    expect(checkCard(units, { ...card, delta: 0.3 }, ['stratum']).status).toBe('confounded');
  });

  it('is unchecked when no other dimension can be told, and skips the card own dimension', () => {
    const units = table([
      ['a', 's1', 5, 10],
      ['b', 's1', 2, 10],
    ]);
    expect(checkCard(units, card, ['stratum'])).toEqual({
      status: 'unchecked',
      adjustedDelta: null,
    });
    expect(checkCard(units, card, ['group'])).toEqual({ status: 'unchecked', adjustedDelta: null });
    expect(checkCard(units, card, [])).toEqual({ status: 'unchecked', adjustedDelta: null });
  });

  it('the strongest explanation wins among several', () => {
    const units: AnalysisUnit[] = table([
      ['a', 's1', 1, 10],
      ['b', 's1', 3, 30],
      ['a', 's2', 28, 50],
      ['b', 's2', 6, 10],
    ]).map((u, i) => ({ ...u, dims: { ...u.dims, other: i % 2 === 0 ? 'x' : 'y' } }));
    const result = checkCard(units, { ...card, delta: 0.3 }, ['other', 'stratum']);
    expect(result).toMatchObject({ status: 'confounded', by: 'stratum' });
  });
});

describe('contextDimensions', () => {
  it('a pattern is checked against the other families, never its own', () => {
    expect(contextDimensions('ground')).not.toContain('temp');
    expect(contextDimensions('ground')).toContain('place_kind');
    expect(contextDimensions('ground')).toContain('time_of_day');
    expect(contextDimensions('place_kind')).toContain('ground');
    expect(contextDimensions('place_kind')).not.toContain('walk_type');
    expect(contextDimensions('time_of_day')).toContain('temp');
    expect(contextDimensions('unknown')).toHaveLength(
      Object.values(DIMENSION_FAMILIES).flat().length,
    );
  });
});
