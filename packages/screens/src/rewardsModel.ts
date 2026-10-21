import type { IconName } from '@pawquest/rn-ui';

/** How one day of the week is drawn on the streak card (docs/25 §4.1). */
export type DayState = 'record' | 'rest' | 'pause' | 'today' | 'future' | 'gap';

export interface WeekDayModel {
  /** "пн" */
  readonly label: string;
  readonly state: DayState;
}

/** 0 = not earned, 1..3 = bronze, silver, gold. */
export type Tier = 0 | 1 | 2 | 3;

export type AchievementSection =
  'walks' | 'observations' | 'training' | 'places' | 'data' | 'health' | 'frisbee';

export type AchievementTab = 'all' | AchievementSection | 'mastery';

/** The tabs of the catalog; health and frisbee come with their waves (docs/25 §3.5). */
export const ACHIEVEMENT_TABS: readonly AchievementTab[] = [
  'all',
  'walks',
  'observations',
  'training',
  'places',
  'data',
  'mastery',
];

export interface AchievementModel {
  readonly id: string;
  readonly title: string;
  /** What it takes, in plain words. */
  readonly condition: string;
  readonly section: AchievementSection;
  readonly icon: IconName;
  readonly mastery: boolean;
  /** Hidden and not yet earned: the catalog shows only a count, never the name. */
  readonly hidden: boolean;
  /** How many steps the achievement has: 1 or 3. */
  readonly steps: 1 | 3;
  readonly tier: Tier;
  /** Current value of the measure (23 walks). */
  readonly value: number;
  /** Value for the next step; null when the last step is earned. */
  readonly nextAt: number | null;
  /** Worded date of the last earned step, null if none. */
  readonly earnedOn: string | null;
  /** When the last step was earned (ms), for ordering; null if none. */
  readonly earnedAt: number | null;
  /** Earned within the last 7 days and not yet looked at. */
  readonly isNew: boolean;
}

export interface GoalRowModel {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly value: number;
  readonly target: number;
}

/** Number of paw prints on the trail between two levels. */
export const TRAIL_STEPS = 10;

/**
 * Fill of every print of the trail for a progress in [0, 1]: whole prints are 1, the one being
 * walked now is partly filled, the rest 0.
 */
export function trailFill(progress: number, steps: number = TRAIL_STEPS): number[] {
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * steps;
  return Array.from({ length: steps }, (_, i) => Math.min(1, Math.max(0, scaled - i)));
}

/** Which step diamonds are filled, e.g. tier 2 of 3 gives [true, true, false]. */
export function tierMarks(tier: Tier, steps: 1 | 3): boolean[] {
  return Array.from({ length: steps }, (_, i) => i < tier);
}

/** Progress to the next step in [0, 1]; 1 when there is no next step. */
export function achievementFraction(a: AchievementModel): number {
  if (a.nextAt === null || a.nextAt <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, a.value / a.nextAt));
}

export function goalFraction(g: GoalRowModel): number {
  return g.target <= 0 ? 0 : Math.min(1, Math.max(0, g.value / g.target));
}

export function goalDone(g: GoalRowModel): boolean {
  return g.target > 0 && g.value >= g.target;
}

/** The up to three goals shown as rings on Today, in the order of the list. */
export function goalRings(goals: readonly GoalRowModel[]): GoalRowModel[] {
  return goals.slice(0, 3);
}

/** A hidden achievement that is not earned stays out of every list. */
function visible(a: AchievementModel): boolean {
  return !(a.hidden && a.tier === 0);
}

/**
 * The achievements closest to their next step (largest share done first, then fewest left). Only
 * achievements that were started count, otherwise "Soon" would list every empty one.
 */
export function nearestAchievements(
  list: readonly AchievementModel[],
  count: number,
): AchievementModel[] {
  return list
    .filter((a) => visible(a) && a.nextAt !== null && a.value > 0)
    .sort((a, b) => {
      const byShare = achievementFraction(b) - achievementFraction(a);
      return byShare !== 0 ? byShare : (a.nextAt ?? 0) - a.value - ((b.nextAt ?? 0) - b.value);
    })
    .slice(0, count);
}

/** Catalog rows for a tab; "only earned" keeps what has at least one step. */
export function filterAchievements(
  list: readonly AchievementModel[],
  tab: AchievementTab,
  onlyEarned: boolean,
): AchievementModel[] {
  return list.filter((a) => {
    if (!visible(a)) {
      return false;
    }
    if (onlyEarned && a.tier === 0) {
      return false;
    }
    if (tab === 'all') {
      return true;
    }
    return tab === 'mastery' ? a.mastery : a.section === tab;
  });
}

export interface EarnedCount {
  readonly earned: number;
  readonly total: number;
  /** Hidden achievements: how many are earned (shown as "found 1"). */
  readonly hiddenEarned: number;
  readonly hiddenTotal: number;
}

/** Counts by achievements (not by steps): a started three-step one counts once when it has a step. */
export function countEarned(list: readonly AchievementModel[]): EarnedCount {
  const open = list.filter((a) => !a.hidden);
  const hidden = list.filter((a) => a.hidden);
  return {
    earned: open.filter((a) => a.tier > 0).length,
    total: open.length,
    hiddenEarned: hidden.filter((a) => a.tier > 0).length,
    hiddenTotal: hidden.length,
  };
}

/** The most recently earned, newest first. */
export function recentlyEarned(
  list: readonly AchievementModel[],
  count: number,
): AchievementModel[] {
  return list
    .filter((a) => a.earnedAt !== null)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0))
    .slice(0, count);
}
