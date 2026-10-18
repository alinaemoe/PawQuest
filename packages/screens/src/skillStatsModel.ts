import type { SkillProgress } from '@pawquest/data';
import type { I18n } from '@pawquest/i18n';

import type { BarModel } from './chartsModel';
import type { StatCardModel } from './placeStatsModel';

/** The words of the "Skills" section of Insights (docs/23, step 3.14). Descriptive, never a mark. */

const DAY_MS = 86_400_000;
const noon = (day: number): number => day * DAY_MS + 12 * 3_600_000;

const percent = (share: number): string => `${String(Math.round(share * 100))}%`;

export function skillCards(
  progress: readonly SkillProgress[],
  today: number,
  now: number,
  i18n: I18n,
): StatCardModel[] {
  return progress.map(({ skill, gap, weeks, attempts, steady }) => {
    const level = skill.currentLevel;
    const subtitle = [
      level === null ? null : i18n.t('skills.stats.level', { level: level.title }),
      i18n.t('skills.stats.sessions', { n: skill.sessionsCount }),
    ]
      .filter((part) => part !== null)
      .join(' · ');
    const last =
      skill.lastPracticedAt === null
        ? i18n.t('skills.stats.never')
        : gap?.daysSince === 0
          ? i18n.t('skills.stats.today')
          : i18n.t('skills.stats.last', { date: i18n.formatDate(skill.lastPracticedAt, now) });
    // a rhythm is told only when there is enough history for one (four practice days or more)
    const rhythm =
      gap !== null && skill.sessionsCount >= 4
        ? i18n.t('skills.stats.rhythm', { n: Math.max(1, Math.round(gap.typicalDays)) })
        : null;
    return {
      id: skill.id,
      title: skill.name,
      subtitle,
      footnote: [last, rhythm].filter((part) => part !== null).join(' · '),
      enough: attempts > 0,
      note: steady
        ? i18n.t('skills.stats.steady')
        : gap?.overdue === true
          ? i18n.t('skills.stats.idle')
          : null,
      bars: weeks.map((w): BarModel => {
        const label = i18n.formatDate(noon(w.mondayDay), noon(today));
        const value =
          w.share === null
            ? '—'
            : `${percent(w.share)} · ${i18n.t('skills.stats.attempts', { n: w.attempts })}`;
        return {
          key: String(w.mondayDay),
          label,
          end: w.share ?? 0,
          ...(w.interval === null
            ? {}
            : { whisker: { from: w.interval.low, to: w.interval.high } }),
          faded: w.attempts > 0 && !w.enough,
          value,
          spoken: i18n.t('skills.stats.spoken', { week: label, value }),
        };
      }),
    };
  });
}
