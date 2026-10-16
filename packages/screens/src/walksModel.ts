import { averagePaceMinPerKm } from '@pawquest/core';
import type { Walk, WalkTotals } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';

export interface WalkRowModel {
  readonly id: string;
  /** "14:05" */
  readonly time: string;
  /** "32 мин · 2,1 км" */
  readonly summary: string;
  /** Short facts under it: a note or the mood, empty when there is nothing to add. */
  readonly detail: string;
}

export interface DayGroup {
  /** "сегодня" / "вчера" / "12 окт" */
  readonly label: string;
  readonly walks: readonly WalkRowModel[];
}

function summaryOf(walk: Pick<Walk, 'durationS' | 'distanceM'>, i18n: I18n): string {
  return [
    walk.durationS === null ? null : i18n.formatDuration(walk.durationS),
    walk.distanceM === null ? null : i18n.formatDistance(walk.distanceM),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Groups walks (already newest first) under their local day, keeping the order. */
export function groupWalksByDay(walks: readonly Walk[], i18n: I18n, now: number): DayGroup[] {
  const groups: { label: string; walks: WalkRowModel[] }[] = [];
  for (const walk of walks) {
    const label = i18n.formatDay(walk.startedAt, now);
    const row: WalkRowModel = {
      id: walk.id,
      time: i18n.formatTime(walk.startedAt),
      summary: summaryOf(walk, i18n),
      detail: walk.title ?? walk.notes ?? '',
    };
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.walks.push(row);
    } else {
      groups.push({ label, walks: [row] });
    }
  }
  return groups;
}

/** "5 прогулок · 3 ч 40 мин · 12 км": plain totals, no judgement (G-19). */
export function totalsLine(totals: WalkTotals, i18n: I18n): string {
  return [
    i18n.t('walks.count', { n: totals.count }),
    i18n.formatDuration(totals.durationS),
    totals.distanceM > 0 ? i18n.formatDistance(totals.distanceM) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export interface WalkFacts {
  readonly label: string;
  readonly value: string;
}

/** The numbers shown in the details of a walk; pace only when the distance is long enough (A-04). */
export function walkFacts(walk: Walk, i18n: I18n): WalkFacts[] {
  const facts: WalkFacts[] = [];
  if (walk.durationS !== null) {
    facts.push({ label: i18n.t('walk.duration'), value: i18n.formatDuration(walk.durationS) });
  }
  if (walk.distanceM !== null) {
    facts.push({ label: i18n.t('walk.distance'), value: i18n.formatDistance(walk.distanceM) });
    // over the time spent moving: standing at a bench or at Mom's door is not pace
    const pace = walk.movingS === null ? null : averagePaceMinPerKm(walk.movingS, walk.distanceM);
    if (pace !== null) {
      facts.push({
        label: i18n.t('walk.pace'),
        value: `${i18n.formatPace(pace)} · ${i18n.formatSpeed(pace)}`,
      });
    }
  }
  return facts;
}
