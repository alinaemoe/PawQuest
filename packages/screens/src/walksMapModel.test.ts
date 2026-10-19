import type { WalkLine } from '@pawquest/data';
import { describe, expect, it } from 'vitest';

import { linesBounds, nearestWalk } from './walksMapModel';

const M = 1 / 111_195; // a metre of latitude, in degrees

/** A line going east from (37, 55) for 100 m, `offsetM` metres north of that. */
const eastwards = (walkId: string, startedAt: number, offsetM = 0): WalkLine => ({
  walkId,
  startedAt,
  coordinates: [
    [37, 55 + offsetM * M],
    [37 + (100 * M) / Math.cos((55 * Math.PI) / 180), 55 + offsetM * M],
  ],
});

describe('nearestWalk', () => {
  const lines = [eastwards('a', 1, 0), eastwards('b', 2, 40)];

  it('the walk whose route passes nearest to the tap, within the tolerance', () => {
    const tap = (northM: number): [number, number] => [37 + 50 * M, 55 + northM * M];
    expect(nearestWalk(lines, tap(5), 20)).toBe('a');
    expect(nearestWalk(lines, tap(36), 20)).toBe('b');
    expect(nearestWalk(lines, tap(20), 25)).not.toBeNull();
  });

  it('nothing is that close: no walk; before the start of a route the end point counts', () => {
    expect(nearestWalk(lines, [37 + 50 * M, 55 + 400 * M], 25)).toBeNull();
    expect(nearestWalk(lines, [37 - 10 * M, 55], 20)).toBe('a');
    expect(nearestWalk([], [37, 55], 20)).toBeNull();
    expect(
      nearestWalk([{ walkId: 'x', startedAt: 1, coordinates: [[37, 55]] }], [37, 55], 20),
    ).toBeNull();
  });

  it('routes on top of each other: the newest walk', () => {
    const same = [eastwards('old', 1), eastwards('new', 9)];
    expect(nearestWalk(same, [37 + 50 * M, 55], 20)).toBe('new');
  });

  it('a route that is a single point stretch (two equal points) still counts', () => {
    const dot: WalkLine = {
      walkId: 'd',
      startedAt: 1,
      coordinates: [
        [37, 55],
        [37, 55],
      ],
    };
    expect(nearestWalk([dot], [37, 55 + 5 * M], 20)).toBe('d');
  });
});

describe('linesBounds', () => {
  it('the frame around every route; none gives nothing', () => {
    const [w, s, e, n] = linesBounds([eastwards('a', 1, 0), eastwards('b', 2, 40)]) ?? [0, 0, 0, 0];
    expect(w).toBe(37);
    expect(s).toBeCloseTo(55, 8);
    expect(e).toBeGreaterThan(37);
    expect(n).toBeCloseTo(55 + 40 * M, 8);
    expect(linesBounds([])).toBeNull();
  });
});
