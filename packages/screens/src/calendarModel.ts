import type { DayWalk, Memory } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';
import type { CalendarWeek } from '@pawquest/insights';

/** The words and cells of the calendar and of "on this day" (docs/23, step 3.8). */

const DAY_MS = 86_400_000;
const noonOf = (day: number): number => day * DAY_MS + 12 * 3_600_000;

export interface CalendarCellModel {
  readonly day: number;
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly walks: number;
  readonly isToday: boolean;
  /** "12 окт: 2 прогулки, 50 мин": for the screen reader. */
  readonly label: string;
  /** "Понедельник, 12 октября": the title of the day's sheet. */
  readonly title: string;
}

export interface CalendarRowModel {
  /** The Monday of the week as a short date ("12 окт"). */
  readonly label: string;
  /** Seven cells, Monday first; null for a day that has not come yet. */
  readonly cells: readonly (CalendarCellModel | null)[];
}

export interface CalendarModel {
  readonly weekdays: readonly string[];
  readonly rows: readonly CalendarRowModel[];
  readonly legend: string;
}

export function calendarModel(
  weeks: readonly CalendarWeek[],
  today: number,
  i18n: I18n,
): CalendarModel {
  return {
    weekdays: Array.from({ length: 7 }, (_, i) =>
      i18n.t(`calendar.weekday.${String(i)}` as MessageKey),
    ),
    rows: weeks.map((week) => ({
      label: i18n.formatDate(noonOf(week.mondayDay), noonOf(today)),
      cells: week.days.map((d) =>
        d === null
          ? null
          : {
              day: d.day,
              level: d.level,
              walks: d.walks,
              isToday: d.day === today,
              title: i18n.formatLongDate(noonOf(d.day)),
              label: i18n.t('calendar.dayLabel', {
                date: i18n.formatDate(noonOf(d.day), noonOf(today)),
                summary:
                  d.walks === 0
                    ? i18n.t('calendar.none')
                    : i18n.t('calendar.summary', {
                        walks: i18n.t('walks.count', { n: d.walks }),
                        duration: i18n.formatDuration(d.durationS),
                      }),
              }),
            },
      ),
    })),
    legend: i18n.t('calendar.legend'),
  };
}

export interface DayRowModel {
  readonly key: string;
  readonly text: string;
}

/** The walks of one day as lines: "10:41 · 1 ч 42 мин · 4,27 км". */
export function dayRows(walks: readonly DayWalk[], i18n: I18n): DayRowModel[] {
  return walks.map((w) => ({
    key: w.id,
    text: i18n.t('calendar.walkRow', {
      time: i18n.formatTime(w.startedAt),
      duration: w.durationS === null ? '—' : i18n.formatDuration(w.durationS),
      distance: w.distanceM === null ? '—' : i18n.formatDistance(w.distanceM),
    }),
  }));
}

export interface MemoryModel {
  readonly key: string;
  /** "Год назад" / "3 года назад". */
  readonly heading: string;
  /** "2 прогулки, 1 ч 10 мин"; null when only pictures were taken. */
  readonly walksLine: string | null;
  readonly photos: readonly { readonly id: string; readonly uri: string }[];
}

/** "On this day", year by year; years in which something happened only. */
export function memoryModels(memories: readonly Memory[], i18n: I18n): MemoryModel[] {
  return memories.map((m) => ({
    key: String(m.yearsAgo),
    heading: i18n.t('album.yearsAgo', { n: m.yearsAgo }),
    walksLine:
      m.walks.length === 0
        ? null
        : i18n.t('memories.walks', {
            walks: i18n.t('walks.count', { n: m.walks.length }),
            duration: i18n.formatDuration(m.walks.reduce((sum, w) => sum + (w.durationS ?? 0), 0)),
          }),
    photos: m.photos.map((p) => ({ id: p.id, uri: p.uri })),
  }));
}
