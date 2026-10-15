import type { EventType, FeedItem, WeightEntry } from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

export type RowIcon =
  | 'pin'
  | 'target'
  | 'note'
  | 'drop'
  | 'disc'
  | 'cookie'
  | 'star'
  | 'paw'
  | 'scale'
  | 'heart'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'square';

export interface FeedRowModel {
  readonly id: string;
  readonly kind: FeedItem['kind'];
  readonly icon: RowIcon;
  readonly title: string;
  readonly subtitle: string;
  /** Events still lacking details get the "can be completed" tag. */
  readonly incomplete: boolean;
}

const EVENT_ICONS: Readonly<Record<string, RowIcon>> = {
  drop: 'drop',
  disc: 'disc',
  cookie: 'cookie',
  note: 'note',
  star: 'star',
  // the marker shapes of the walk screen, so a row looks like its button
  dog: 'circle',
  person: 'circle',
  animal: 'circle',
  child: 'triangle',
  diamond: 'diamond',
  square: 'square',
};

/** Title of an event type: the i18n label for built-in types, the user's own text for custom ones. */
export function eventTypeLabel(type: EventType | undefined, typeId: string, i18n: I18n): string {
  if (type === undefined) {
    return typeId;
  }
  if (type.labelKey !== null) {
    return i18n.t(type.labelKey as MessageKey);
  }
  return type.label ?? typeId;
}

/** One line of the "recent" list on Today, in the calm tone of G-19. */
export function feedRow(
  item: FeedItem,
  i18n: I18n,
  eventTypes: ReadonlyMap<string, EventType>,
  now: number,
): FeedRowModel {
  const when = i18n.formatAgo(item.ts, now);
  switch (item.kind) {
    case 'walk': {
      const parts = [
        item.durationS === null ? null : i18n.formatDuration(item.durationS),
        item.distanceM === null ? null : i18n.formatDistance(item.distanceM),
      ].filter((p): p is string => p !== null);
      return {
        id: item.id,
        kind: 'walk',
        icon: 'pin',
        title: i18n.t('feed.walk'),
        subtitle: [...parts, when].join(' · '),
        incomplete: false,
      };
    }
    case 'session':
      return {
        id: item.id,
        kind: 'session',
        icon: 'target',
        title: item.skillName,
        subtitle: `${i18n.t('feed.attempts', { n: item.attempts })} · ${when}`,
        incomplete: false,
      };
    case 'event': {
      const type = eventTypes.get(item.typeId);
      return {
        id: item.id,
        kind: 'event',
        icon: EVENT_ICONS[type?.icon ?? ''] ?? 'paw',
        title: eventTypeLabel(type, item.typeId, i18n),
        subtitle: [item.note, when].filter((p): p is string => p !== null && p !== '').join(' · '),
        incomplete: false,
      };
    }
    case 'symptom':
      return {
        id: item.id,
        kind: 'symptom',
        icon: 'heart',
        title: i18n.t('feed.symptom'),
        subtitle: `${item.symptom} · ${when}`,
        incomplete: false,
      };
    case 'weight':
      return {
        id: item.id,
        kind: 'weight',
        icon: 'scale',
        title: i18n.t('feed.weight'),
        subtitle: `${i18n.formatWeight(item.weightG)} · ${when}`,
        incomplete: false,
      };
  }
}

/** "Last walk 4 hours ago · 32 min", or the empty-state line (S01-S). */
export function lastWalkLine(
  last: { readonly startedAt: number; readonly durationS: number | null } | null,
  i18n: I18n,
  now: number,
): string {
  if (last === null) {
    return i18n.t('today.noWalks');
  }
  const ago = i18n.formatAgo(last.startedAt, now);
  if (last.durationS === null) {
    return i18n.t('today.lastWalkShort', { ago });
  }
  return i18n.t('today.lastWalk', { ago, duration: i18n.formatDuration(last.durationS) });
}

/** The "please weigh your dog" card title (S01-Wt): how long it has been, or that it never was. */
export function weightCardTitle(latest: WeightEntry | null, i18n: I18n, now: number): string {
  if (latest === null) {
    return i18n.t('today.weightNever');
  }
  const days = Math.floor((now - latest.measuredAt) / 86_400_000);
  return i18n.t('today.weightTitle', { n: days });
}

/** "1 год 2 месяца" from an approximate age in months, or null when unknown. */
export function ageText(months: number | null, t: I18n['t']): string | null {
  if (months === null) {
    return null;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) {
    parts.push(t('dog.ageYears', { n: years }));
  }
  if (rest > 0 || years === 0) {
    parts.push(t('dog.ageMonths', { n: rest }));
  }
  return parts.join(' ');
}
