import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENT_TABS,
  achievementFraction,
  countEarned,
  filterAchievements,
  goalDone,
  goalFraction,
  goalRings,
  nearestAchievements,
  recentlyEarned,
  tierMarks,
  trailFill,
  type AchievementModel,
  type GoalRowModel,
} from './rewardsModel';

function ach(over: Partial<AchievementModel> & { id: string }): AchievementModel {
  return {
    title: over.id,
    condition: '',
    section: 'walks',
    icon: 'paw',
    mastery: false,
    hidden: false,
    steps: 3,
    tier: 0,
    value: 0,
    nextAt: 10,
    earnedOn: null,
    earnedAt: null,
    isNew: false,
    ...over,
  };
}

function goal(value: number, target: number): GoalRowModel {
  return { id: 'g', icon: 'target', title: 'g', value, target };
}

describe('trailFill', () => {
  it('fills whole prints and one partly', () => {
    const fill = trailFill(0.35);
    expect(fill).toHaveLength(10);
    expect(fill.slice(0, 3)).toEqual([1, 1, 1]);
    expect(fill[3]).toBeCloseTo(0.5);
    expect(fill.slice(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('clamps outside [0, 1]', () => {
    expect(trailFill(-1).every((x) => x === 0)).toBe(true);
    expect(trailFill(2).every((x) => x === 1)).toBe(true);
  });
});

describe('tierMarks', () => {
  it('marks the earned steps', () => {
    expect(tierMarks(2, 3)).toEqual([true, true, false]);
    expect(tierMarks(0, 1)).toEqual([false]);
    expect(tierMarks(3, 3)).toEqual([true, true, true]);
  });
});

describe('fractions', () => {
  it('is share of the next step, full at the last step', () => {
    expect(achievementFraction(ach({ id: 'a', value: 5, nextAt: 10 }))).toBe(0.5);
    expect(achievementFraction(ach({ id: 'a', value: 50, nextAt: 10 }))).toBe(1);
    expect(achievementFraction(ach({ id: 'a', value: 9, nextAt: null }))).toBe(1);
    expect(achievementFraction(ach({ id: 'a', value: 1, nextAt: 0 }))).toBe(1);
  });

  it('goal share and done', () => {
    expect(goalFraction(goal(2, 3))).toBeCloseTo(2 / 3);
    expect(goalFraction(goal(5, 3))).toBe(1);
    expect(goalFraction(goal(1, 0))).toBe(0);
    expect(goalDone(goal(3, 3))).toBe(true);
    expect(goalDone(goal(2, 3))).toBe(false);
    expect(goalDone(goal(0, 0))).toBe(false);
  });

  it('keeps three rings at most', () => {
    expect(goalRings([goal(1, 2), goal(1, 2), goal(1, 2), goal(1, 2)])).toHaveLength(3);
  });
});

describe('nearestAchievements', () => {
  it('takes started ones with the largest share, ties by fewest left', () => {
    const list = [
      ach({ id: 'half', value: 5, nextAt: 10 }),
      ach({ id: 'most', value: 9, nextAt: 10 }),
      ach({ id: 'empty', value: 0, nextAt: 10 }),
      ach({ id: 'done', value: 10, nextAt: null, tier: 3 }),
      ach({ id: 'tieBig', value: 50, nextAt: 100 }),
      ach({ id: 'secret', hidden: true, value: 9, nextAt: 10 }),
    ];
    expect(nearestAchievements(list, 3).map((a) => a.id)).toEqual(['most', 'half', 'tieBig']);
  });

  it('breaks an equal share by fewest left', () => {
    const list = [
      ach({ id: 'wide', value: 50, nextAt: 100 }),
      ach({ id: 'narrow', value: 5, nextAt: 10 }),
    ];
    expect(nearestAchievements(list, 2).map((a) => a.id)).toEqual(['narrow', 'wide']);
  });
});

describe('filterAchievements', () => {
  const list = [
    ach({ id: 'w', section: 'walks', tier: 1 }),
    ach({ id: 't', section: 'training', mastery: true }),
    ach({ id: 'h', section: 'data', hidden: true }),
    ach({ id: 'hOpen', section: 'data', hidden: true, tier: 1 }),
  ];

  it('never lists a hidden achievement that is not earned', () => {
    expect(filterAchievements(list, 'all', false).map((a) => a.id)).toEqual(['w', 't', 'hOpen']);
  });

  it('filters by section, mastery and earned', () => {
    expect(filterAchievements(list, 'training', false).map((a) => a.id)).toEqual(['t']);
    expect(filterAchievements(list, 'mastery', false).map((a) => a.id)).toEqual(['t']);
    expect(filterAchievements(list, 'all', true).map((a) => a.id)).toEqual(['w', 'hOpen']);
  });

  it('has a tab for every section that has achievements in wave 1', () => {
    expect(ACHIEVEMENT_TABS).toContain('mastery');
    expect(ACHIEVEMENT_TABS[0]).toBe('all');
  });
});

describe('countEarned', () => {
  it('counts open and hidden separately', () => {
    const list = [
      ach({ id: 'a', tier: 1 }),
      ach({ id: 'b' }),
      ach({ id: 'c', hidden: true, tier: 1 }),
      ach({ id: 'd', hidden: true }),
    ];
    expect(countEarned(list)).toEqual({ earned: 1, total: 2, hiddenEarned: 1, hiddenTotal: 2 });
  });
});

describe('recentlyEarned', () => {
  it('orders by time, newest first', () => {
    const list = [
      ach({ id: 'old', earnedAt: 1, earnedOn: 'x' }),
      ach({ id: 'none' }),
      ach({ id: 'new', earnedAt: 9, earnedOn: 'y' }),
    ];
    expect(recentlyEarned(list, 5).map((a) => a.id)).toEqual(['new', 'old']);
    expect(recentlyEarned(list, 1)).toHaveLength(1);
  });
});
