import {
  SKILL_TEMPLATES,
  createSkill,
  getSkill,
  lastSessionSettings,
  listSkillSummaries,
  startSession,
} from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { useToast } from '@pawquest/rn-ui';
import {
  PrepSheet,
  repeatLine,
  skillFromTemplate,
  SkillPickerSheet,
  TemplateSheet,
  type PickerSkill,
  type PrepSettings,
} from '@pawquest/screens';
import { useMemo } from 'react';

import { useApp } from './AppContext';

/** Which training sheet is open; null means none. */
export type FlowState =
  | { readonly kind: 'picker' }
  | { readonly kind: 'template' }
  | { readonly kind: 'prep'; readonly skillId: string };

export interface TrainingFlowProps {
  readonly state: FlowState | null;
  readonly onChange: (state: FlowState | null) => void;
}

const deviceOffsetMin = (): number => -new Date().getTimezoneOffset();

/**
 * The sheets that lead into a session: pick a skill (one tap repeats the last settings), adjust
 * the step, place, distraction and reward, or create a skill from a template. Used from Today
 * and from the Training tab, so starting a session looks the same everywhere.
 */
export function TrainingFlow({ state, onChange }: TrainingFlowProps) {
  const { db, ctx, dog, i18n, version, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';

  const skills = useMemo(() => listSkillSummaries(db, dogId), [db, dogId, version]);
  const picker = useMemo<PickerSkill[]>(
    () =>
      skills.map((skill) => {
        const last = lastSessionSettings(db, skill.id);
        const levelTitle = skill.currentLevel?.title ?? null;
        return {
          id: skill.id,
          name: skill.name,
          repeat:
            last === null
              ? null
              : repeatLine(
                  {
                    levelTitle,
                    context: last.context,
                    distraction: last.distraction,
                    reward: last.reward,
                  },
                  i18n,
                ),
          levelText: levelTitle,
        };
      }),
    [db, skills, i18n],
  );

  const templates = useMemo(
    () =>
      SKILL_TEMPLATES.map((t) => ({
        key: t.key,
        name: i18n.t(`skill.${t.key}` as MessageKey),
        criterion: i18n.t(`crit.${t.key}` as MessageKey),
      })),
    [i18n],
  );

  const begin = (skillId: string, settings: PrepSettings): void => {
    startSession(db, ctx, dogId, skillId, {
      levelId: settings.levelId,
      context: settings.context,
      distraction: settings.distraction,
      reward: settings.reward,
      tzOffsetMin: deviceOffsetMin(),
    });
    onChange(null);
    bump();
  };

  const quickStart = (skillId: string): void => {
    const skill = getSkill(db, skillId);
    if (skill === null) {
      return;
    }
    const last = lastSessionSettings(db, skillId);
    begin(skillId, {
      // always the skill's current step: it may have moved up since the last session
      levelId: skill.currentLevelId,
      context: last?.context ?? null,
      distraction: last?.distraction ?? null,
      reward: last?.reward ?? null,
    });
  };

  const prepSkill = state?.kind === 'prep' ? getSkill(db, state.skillId) : null;
  const prepLast = prepSkill === null ? null : lastSessionSettings(db, prepSkill.id);

  return (
    <>
      <SkillPickerSheet
        visible={state?.kind === 'picker'}
        skills={picker}
        onClose={() => {
          onChange(null);
        }}
        onQuickStart={quickStart}
        onAdjust={(skillId) => {
          onChange({ kind: 'prep', skillId });
        }}
        onNewSkill={() => {
          onChange({ kind: 'template' });
        }}
      />
      <TemplateSheet
        visible={state?.kind === 'template'}
        templates={templates}
        onClose={() => {
          onChange(null);
        }}
        onChoose={(key, customName) => {
          const template = SKILL_TEMPLATES.find((t) => t.key === key);
          if (template === undefined) {
            return;
          }
          const skill = createSkill(
            db,
            ctx,
            skillFromTemplate(template, dogId, i18n, key === 'custom' ? customName : undefined),
          );
          bump();
          toast.show({ message: skill.name });
          onChange({ kind: 'prep', skillId: skill.id });
        }}
      />
      <PrepSheet
        visible={prepSkill !== null}
        skillName={prepSkill?.name ?? ''}
        levels={prepSkill?.levels.map((l) => ({ id: l.id, title: l.title })) ?? []}
        initial={{
          levelId: prepSkill?.currentLevelId ?? null,
          context: prepLast?.context ?? null,
          distraction: prepLast?.distraction ?? null,
          reward: prepLast?.reward ?? null,
        }}
        onClose={() => {
          onChange(null);
        }}
        onStart={(settings) => {
          if (prepSkill !== null) {
            begin(prepSkill.id, settings);
          }
        }}
      />
    </>
  );
}
