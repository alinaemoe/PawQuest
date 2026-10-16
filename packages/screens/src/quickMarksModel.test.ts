import { describe, expect, it } from 'vitest';

import {
  PANEL_LIMIT,
  addToOrder,
  moveInOrder,
  panelIsFull,
  panelRows,
  removeFromOrder,
} from './quickMarksModel';

describe('moveInOrder', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('swaps a mark with its neighbour', () => {
    expect(moveInOrder(order, 1, -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveInOrder(order, 1, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps the ends and bad indices where they are, and never changes its input', () => {
    expect(moveInOrder(order, 0, -1)).toEqual(order);
    expect(moveInOrder(order, 3, 1)).toEqual(order);
    expect(moveInOrder(order, -1, 1)).toEqual(order);
    expect(moveInOrder(order, 9, -1)).toEqual(order);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
    expect(moveInOrder(order, 0, 1)).not.toBe(order);
  });

  it('handles an empty or one-item panel', () => {
    expect(moveInOrder([], 0, 1)).toEqual([]);
    expect(moveInOrder(['a'], 0, 1)).toEqual(['a']);
  });
});

describe('addToOrder, removeFromOrder, panelIsFull', () => {
  it('adds at the end, once', () => {
    expect(addToOrder(['a'], 'b')).toEqual(['a', 'b']);
    expect(addToOrder(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('does not add to a full panel', () => {
    const full = Array.from({ length: PANEL_LIMIT }, (_, i) => `m${String(i)}`);
    expect(panelIsFull(full)).toBe(true);
    expect(addToOrder(full, 'extra')).toEqual(full);
    expect(panelIsFull(full.slice(1))).toBe(false);
  });

  it('removes a mark and keeps the order of the rest', () => {
    expect(removeFromOrder(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(removeFromOrder(['a'], 'zzz')).toEqual(['a']);
  });
});

describe('panelRows', () => {
  it('lays the marks out in three rows of three with empty slots at the end', () => {
    expect(panelRows(['a', 'b', 'c', 'd', 'e'])).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', null],
      [null, null, null],
    ]);
  });

  it('an empty panel is nine empty slots and a full one has none', () => {
    expect(
      panelRows([])
        .flat()
        .every((cell) => cell === null),
    ).toBe(true);
    const full = Array.from({ length: 9 }, (_, i) => `m${String(i)}`);
    expect(panelRows(full).flat()).toEqual(full);
  });
});
