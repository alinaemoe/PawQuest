import type { WalkPatterns } from '@pawquest/data';
import type { CheckedCard, Facts, PreliminaryCard } from '@pawquest/insights';
import { PRELIMINARY, PRELIMINARY_FALSE_RATE_PERCENT } from '@pawquest/insights';
import type { I18n, MessageKey } from '@pawquest/i18n';

/** The words and numbers of the Insights screen (docs/23, step 3.5): no component logic in the screen. */

export interface InsightCardModel {
  readonly key: string;
  readonly group: { readonly dimension: string; readonly value: string; readonly outcome: string };
  /** "Земля: мокро". */
  readonly title: string;
  /** "Сложные моменты были в 7 из 8 прогулок, в остальных в 1 из 8." */
  readonly body: string;
  /** "Заметная разница"; null for observations (they are not findings). */
  readonly label: string | null;
  /** "Найдено среди 61 проверенных сравнений"; null for observations. */
  readonly found: string | null;
  /** What the check against the other dimensions said, in words. */
  readonly note: string;
}

export interface FactRowModel {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface InsightsModel {
  /** "Посчитано: 12 прогулок" or "Пока считаю… 8 из 12 прогулок". */
  readonly status: string;
  readonly counting: boolean;
  readonly facts: readonly FactRowModel[];
  readonly cards: readonly InsightCardModel[];
  readonly prelim: readonly InsightCardModel[];
  readonly prelimWarning: string | null;
  readonly explained: readonly InsightCardModel[];
  readonly explainedHint: string;
  /** Few walks and no cards: what is missing. */
  readonly empty: { readonly title: string; readonly text: string; readonly hint: string } | null;
  /** Enough walks, nothing found. */
  readonly noCards: string | null;
  readonly honesty: string;
}

function lookup(i18n: I18n, key: string, params?: Record<string, string | number>): string | null {
  try {
    return i18n.t(key as MessageKey, params);
  } catch {
    return null;
  }
}

/** The key part of a value: `-` cannot be in a message key. */
const valuePart = (value: string): string => value.replace('-', 'm');

export function dimensionLabel(i18n: I18n, dimension: string): string {
  return lookup(i18n, `insights.dim.${dimension}`) ?? dimension;
}

export function valueLabel(i18n: I18n, dimension: string, value: string): string {
  return lookup(i18n, `insights.val.${dimension}.${valuePart(value)}`) ?? value;
}

function cardModel(
  card: CheckedCard | PreliminaryCard,
  i18n: I18n,
  isFinding: boolean,
): InsightCardModel {
  const outcome = lookup(i18n, `insights.outcome.${card.outcome}`) ?? card.outcome;
  const adjustment = card.adjustment;
  const note =
    adjustment.status === 'confounded'
      ? i18n.t('insights.adjust.confounded', {
          dim: dimensionLabel(i18n, adjustment.by ?? ''),
        })
      : i18n.t(
          adjustment.status === 'holds' ? 'insights.adjust.holds' : 'insights.adjust.unchecked',
        );
  return {
    key: card.key,
    group: { dimension: card.dimension, value: card.value, outcome: card.outcome },
    title: i18n.t('insights.card.title', {
      dim: dimensionLabel(i18n, card.dimension),
      value: valueLabel(i18n, card.dimension, card.value),
    }),
    body: i18n.t('insights.card.body', {
      outcome,
      k: card.inCondition.k,
      n: card.inCondition.n,
      k2: card.rest.k,
      n2: card.rest.n,
    }),
    label: isFinding ? i18n.t(`insights.label.${card.label}` as MessageKey) : null,
    found: isFinding ? i18n.t('insights.card.found', { n: card.testedCount }) : null,
    note,
  };
}

const TIE_NAMES = 3;

function names(values: readonly string[], i18n: I18n): string {
  const shown = values.slice(0, TIE_NAMES).join(', ');
  const more = values.length - TIE_NAMES;
  return more > 0 ? `${shown} ${i18n.t('insights.fact.moreTied', { n: more })}` : shown;
}

export interface FactSources {
  readonly placeName: (id: string) => string | undefined;
  /** When each walk began, for the dates of the records. */
  readonly startOf: (walkId: string) => number | undefined;
}

/** The facts as rows, in the order shown; a fact that does not exist (too few walks) has no row. */
export function factRows(
  facts: Facts,
  sources: FactSources,
  i18n: I18n,
  now: number,
): FactRowModel[] {
  const rows: FactRowModel[] = [];
  const date = (ts: number | undefined): string =>
    ts === undefined ? '' : i18n.formatDate(ts, now);
  const dayStart = (day: number): number => day * 86_400_000 + 12 * 3_600_000;
  const more = (n: number): string =>
    n > 1 ? ` · ${i18n.t('insights.fact.moreTied', { n: n - 1 })}` : '';

  if (facts.totals.walks > 0) {
    rows.push({
      key: 'totals',
      label: i18n.t('insights.fact.totals'),
      value: i18n.t('insights.fact.totalsValue', {
        walks: i18n.t('walks.count', { n: facts.totals.walks }),
        distance: i18n.formatDistance(facts.totals.distanceM),
        time: i18n.formatDuration(facts.totals.durationS),
      }),
    });
  }

  const favourite = <T>(
    key: string,
    labelKey: MessageKey,
    fav: { readonly values: readonly T[]; readonly count: number; readonly of: number } | null,
    name: (value: T) => string,
  ): void => {
    const named = fav === null ? [] : fav.values.map(name).filter((n) => n !== '');
    if (fav === null || named.length === 0) {
      return;
    }
    const text = i18n.t('insights.fact.share', {
      names: names(named, i18n),
      n: fav.count,
      of: fav.of,
    });
    rows.push({
      key,
      label: i18n.t(labelKey),
      value: named.length > 1 ? i18n.t('insights.fact.tie', { names: text }) : text,
    });
  };
  favourite(
    'place',
    'insights.fact.favPlace',
    facts.favouritePlaces,
    (id) => sources.placeName(id) ?? '',
  );
  favourite(
    'time',
    'insights.fact.favTime',
    facts.favouriteTimeOfDay,
    (v) => lookup(i18n, `insights.time.${v}`) ?? v,
  );
  favourite(
    'weekday',
    'insights.fact.favWeekday',
    facts.favouriteWeekdays,
    (d) => lookup(i18n, `insights.weekday.${String(d)}`) ?? '',
  );

  if (facts.longestWalk !== null) {
    const { value, walkIds } = facts.longestWalk;
    rows.push({
      key: 'longest',
      label: i18n.t('insights.fact.longest'),
      value:
        i18n.t('insights.fact.valueOn', {
          value: i18n.formatDuration(value),
          date: date(sources.startOf(walkIds[0] ?? '')),
        }) + more(walkIds.length),
    });
  }
  if (facts.farthestWalk !== null) {
    const { value, walkIds } = facts.farthestWalk;
    rows.push({
      key: 'farthest',
      label: i18n.t('insights.fact.farthest'),
      value:
        i18n.t('insights.fact.valueOn', {
          value: i18n.formatDistance(value),
          date: date(sources.startOf(walkIds[0] ?? '')),
        }) + more(walkIds.length),
    });
  }
  if (facts.longestCalm !== null) {
    const { value, walkIds } = facts.longestCalm;
    rows.push({
      key: 'calm',
      label: i18n.t('insights.fact.calm'),
      value:
        i18n.t('insights.fact.calmValue', {
          duration: i18n.formatDuration(Math.round(value / 1000)),
          date: date(sources.startOf(walkIds[0] ?? '')),
        }) + more(walkIds.length),
    });
  }
  if (facts.busiestWeek !== null) {
    const w = facts.busiestWeek;
    const params = {
      walks: i18n.t('walks.count', { n: w.walks }),
      date: date(dayStart(w.weekStartDay)),
    };
    rows.push({
      key: 'week',
      label: i18n.t('insights.fact.week'),
      value:
        w.tied > 1
          ? i18n.t('insights.fact.weekTied', { ...params, more: w.tied - 1 })
          : i18n.t('insights.fact.weekValue', params),
    });
  }
  if (facts.streak !== null) {
    rows.push({
      key: 'streak',
      label: i18n.t('insights.fact.streak'),
      value: i18n.t('insights.fact.streakValue', {
        best: facts.streak.best,
        current: facts.streak.current,
      }),
    });
  }
  return rows;
}

export interface BuildInsightsInput {
  readonly patterns: WalkPatterns;
  readonly facts: Facts;
  readonly placeName: (id: string) => string | undefined;
  /** When each walk began, for the dates of the records. */
  readonly startOf: (walkId: string) => number | undefined;
  readonly now: number;
}

/** The whole screen as text and numbers. */
export function buildInsights(input: BuildInsightsInput, i18n: I18n): InsightsModel {
  const { patterns, facts } = input;
  const { health, unitCount } = patterns;
  const counting = health.stale > 0;
  const factList = factRows(facts, input, i18n, input.now);

  const cards = patterns.cards.map((c) => cardModel(c, i18n, true));
  const prelim = patterns.preliminary.map((c) => cardModel(c, i18n, false));
  const explained = patterns.explained.map((c) => cardModel(c, i18n, true));
  const needed = PRELIMINARY.minUnits;
  const empty =
    unitCount < needed && cards.length === 0
      ? {
          title: i18n.t('insights.empty.title'),
          text: i18n.t('insights.empty.text', { need: needed, have: unitCount }),
          hint: i18n.t('insights.empty.hint'),
        }
      : null;
  return {
    status: counting
      ? i18n.t('insights.status.counting', {
          done: health.current + health.errors,
          total: health.walks,
        })
      : i18n.t('insights.status.done', { walks: i18n.t('walks.count', { n: health.walks }) }),
    counting,
    facts: factList,
    cards,
    prelim,
    prelimWarning:
      prelim.length > 0
        ? i18n.t('insights.prelim.warning', { percent: PRELIMINARY_FALSE_RATE_PERCENT })
        : null,
    explained,
    explainedHint: i18n.t('insights.explained.hint'),
    empty,
    noCards:
      empty === null && cards.length === 0 && prelim.length === 0
        ? i18n.t('insights.noCards')
        : null,
    honesty: i18n.t('insights.honesty'),
  };
}
