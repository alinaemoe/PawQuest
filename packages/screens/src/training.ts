import type {
  LevelAxis,
  SkillInput,
  SkillSummary,
  SkillTemplate,
  TrainingContext,
} from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

export type SkillStatus = 'new' | 'active' | 'overdue';

/** Title of one step of a skill, in the user's units: "Дистанция 5 м", "Время 30 с", "Отвлечение D2". */
export function levelTitle(axis: LevelAxis, value: number, index: number, i18n: I18n): string {
  switch (axis) {
    case 'distance':
      return i18n.t('level.distance', { n: i18n.formatDistance(value) });
    case 'duration':
      return i18n.t('level.duration', { n: i18n.formatDuration(value) });
    case 'distraction':
      return i18n.t('level.distraction', { n: value });
    case 'trigger':
      return i18n.t('level.trigger', { n: i18n.formatDistance(value) });
    case 'custom':
      return i18n.t('level.custom', { n: index + 1 });
  }
}

/** A new skill from a template: translated name, criterion and titled steps (all editable later). */
export function skillFromTemplate(
  template: SkillTemplate,
  dogId: string,
  i18n: I18n,
  customName?: string,
): SkillInput {
  const name = `skill.${template.key}` as MessageKey;
  return {
    dogId,
    name: customName !== undefined && customName.trim() !== '' ? customName.trim() : i18n.t(name),
    templateKey: template.key,
    criterion: i18n.t(`crit.${template.key}` as MessageKey),
    levels: template.values.map((value, index) => ({
      title: levelTitle(template.axis, value, index, i18n),
      distanceM: template.axis === 'distance' || template.axis === 'trigger' ? value : null,
      durationS: template.axis === 'duration' ? value : null,
      distraction: template.axis === 'distraction' ? value : null,
    })),
  };
}

const NEW_SESSIONS = 3;

/** New (few sessions), in progress, or not practiced for a while (A-10 passes `overdue`). */
export function skillStatus(skill: SkillSummary, overdue: boolean): SkillStatus {
  if (skill.sessionsCount < NEW_SESSIONS) {
    return 'new';
  }
  return overdue ? 'overdue' : 'active';
}

export interface RepeatSettings {
  readonly levelTitle: string | null;
  readonly context: TrainingContext | null;
  readonly distraction: number | null;
  readonly reward: string | null;
}

/** One line that tells what "same as last time" means: "Дистанция 5 м · Парк · D3 · Лакомство". */
export function repeatLine(settings: RepeatSettings, i18n: I18n): string {
  const rewardKey = settings.reward === null ? null : (`reward.${settings.reward}` as MessageKey);
  const reward =
    rewardKey === null ? null : rewardKey in i18nRewardKeys ? i18n.t(rewardKey) : settings.reward;
  return [
    settings.levelTitle,
    settings.context === null ? null : i18n.t(`ctx.${settings.context}` as MessageKey),
    settings.distraction === null ? null : `D${String(settings.distraction)}`,
    reward,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

/** The rewards that have a translation; anything else is the owner's own text. */
const i18nRewardKeys: Readonly<Record<string, true>> = {
  'reward.treat': true,
  'reward.toy': true,
  'reward.praise': true,
};

/** Whole percent of successes for display, or null without attempts. */
export function percent(share: number | null): number | null {
  return share === null ? null : Math.round(share * 100);
}
