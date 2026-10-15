import { DETAIL_FIELD_COUNT, filledFields, type DiaryEntry, type EventType } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { eventTypeLabel, type RowIcon } from './model';

export interface DiaryRowModel {
  readonly id: string;
  readonly icon: RowIcon;
  readonly title: string;
  readonly subtitle: string;
  /** Still lacks details: shows the "can be completed" tag. */
  readonly incomplete: boolean;
}

export interface DiaryGroup {
  readonly label: string;
  readonly rows: readonly DiaryRowModel[];
}

const ICONS: Readonly<Record<string, RowIcon>> = {
  dog: 'circle',
  person: 'circle',
  animal: 'circle',
  child: 'triangle',
  diamond: 'diamond',
  square: 'square',
  star: 'star',
  drop: 'drop',
  disc: 'disc',
  cookie: 'cookie',
  note: 'note',
};

const BUCKET_KEYS = { far: 'abc.far', mid: 'abc.mid', near: 'abc.near' } as const;

/** "близко · R3 · быстро успокоилась · 4 часа назад": facts only, no verdicts (G-19). */
export function diaryRow(
  entry: DiaryEntry,
  i18n: I18n,
  types: ReadonlyMap<string, EventType>,
  now: number,
): DiaryRowModel {
  const { event, detail } = entry;
  const type = types.get(event.typeId);
  const parts = [
    event.distanceBucket === null ? null : i18n.t(BUCKET_KEYS[event.distanceBucket]).toLowerCase(),
    event.reaction === null ? null : `R${String(event.reaction)}`,
    event.distraction === null ? null : `D${String(event.distraction)}`,
    detail.outcome === null ? null : i18n.t(`out.${detail.outcome}` as MessageKey).toLowerCase(),
    event.note,
    i18n.formatAgo(event.ts, now),
  ];
  return {
    id: event.id,
    icon: ICONS[type?.icon ?? ''] ?? 'paw',
    title: eventTypeLabel(type, event.typeId, i18n),
    subtitle: parts.filter((p): p is string => p !== null && p !== '').join(' · '),
    incomplete: event.incomplete && event.typeId !== 'toilet' && event.typeId !== 'note',
  };
}

/** Groups diary rows under their local day, keeping the newest-first order. */
export function groupDiaryByDay(
  entries: readonly DiaryEntry[],
  i18n: I18n,
  types: ReadonlyMap<string, EventType>,
  now: number,
): DiaryGroup[] {
  const groups: { label: string; rows: DiaryRowModel[] }[] = [];
  for (const entry of entries) {
    const label = i18n.formatDay(entry.event.ts, now);
    const row = diaryRow(entry, i18n, types, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.rows.push(row);
    } else {
      groups.push({ label, rows: [row] });
    }
  }
  return groups;
}

/** "Заполнено 3 из 8". */
export function filledLine(entry: DiaryEntry, i18n: I18n): string {
  return i18n.t('diary.fieldsFilled', {
    done: filledFields(entry.event, entry.detail),
    total: DETAIL_FIELD_COUNT,
  });
}
