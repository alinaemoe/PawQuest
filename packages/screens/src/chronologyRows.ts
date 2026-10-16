import type { ChronoStep } from '@pawquest/core';
import type { I18n } from '@pawquest/i18n';

export interface TimelineRow {
  readonly key: string;
  readonly time: string;
  readonly kind: 'visit' | 'leg' | 'ride';
  readonly text: string;
  readonly detail: string;
  /** The moments the row covers: what a mark on it would apply to. */
  readonly fromTs: number;
  readonly toTs: number;
  /** A visit long enough to be marked as spent indoors. */
  readonly canMark: boolean;
  readonly indoor: boolean;
}

/** Without a signal for this long inside a visit the row says so (a shop, a lift). */
const SHOW_GAP_S = 120;
/** A visit shorter than this is not worth asking about. */
const MARK_MIN_S = 180;

/** The chronology of a walk as lines of text: "10:41 · Магазин · 7 мин", "Переход · 14 мин · 1,1 км". */
export function timelineRows(
  steps: readonly ChronoStep[],
  placeNames: ReadonlyMap<string, string>,
  i18n: I18n,
): TimelineRow[] {
  return steps.map((step, index) => {
    const time = i18n.formatTime(step.fromTs);
    const key = `${String(index)}-${String(step.fromTs)}`;
    if (step.kind === 'ride') {
      return {
        key,
        time,
        kind: 'ride',
        text: i18n.t('walk.timeline.ride'),
        fromTs: step.fromTs,
        toTs: step.toTs,
        canMark: false,
        indoor: false,
        detail: `${i18n.formatDuration(Math.round(step.durationS))} · ${i18n.formatDistance(step.lengthM)}`,
      };
    }
    if (step.kind === 'leg') {
      return {
        key,
        time,
        kind: 'leg',
        text: i18n.t('walk.timeline.leg'),
        fromTs: step.fromTs,
        toTs: step.toTs,
        canMark: false,
        indoor: false,
        detail: `${i18n.formatDuration(Math.round(step.durationS))} · ${i18n.formatDistance(step.lengthM)}`,
      };
    }
    const name = step.placeId === null ? undefined : placeNames.get(step.placeId);
    const parts = [i18n.formatDuration(Math.round(step.durationS))];
    if (step.gapS >= SHOW_GAP_S) {
      parts.push(i18n.t('walk.timeline.gap'));
    }
    if (step.indoor) {
      parts.push(i18n.t('walk.timeline.indoor'));
    }
    return {
      key,
      time,
      kind: 'visit',
      fromTs: step.fromTs,
      toTs: step.toTs,
      canMark: step.durationS >= MARK_MIN_S,
      indoor: step.indoor,
      text: name ?? i18n.t('walk.timeline.stay'),
      detail: parts.join(' · '),
    };
  });
}
