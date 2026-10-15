import { AppText, Avatar, Button, Card, Screen, Tag, useI18n } from '@pawquest/rn-ui';
import { Pressable, View } from 'react-native';

import type { SkillStatus } from './training';

export interface SkillCardModel {
  readonly id: string;
  readonly name: string;
  /** "Ступень 2 из 4", null when the skill has a single step. */
  readonly levelText: string | null;
  /** "Практика: 3 дня назад" or "Ещё не занимались". */
  readonly lastText: string;
  readonly sessionsText: string;
  readonly status: SkillStatus;
}

export interface TrainingScreenProps {
  readonly skills: readonly SkillCardModel[];
  readonly onStart: () => void;
  readonly onNewSkill: () => void;
  /** Tap on a card: start a session of that skill. */
  readonly onOpenSkill: (id: string) => void;
}

const STATUS_KEYS = {
  new: 'training.statusNew',
  active: 'training.statusActive',
  overdue: 'training.statusOverdue',
} as const;

/** The Training tab (spec S09): skills with their step and last practice, one big start button. */
export function TrainingScreen({ skills, onStart, onNewSkill, onOpenSkill }: TrainingScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <AppText variant="numBig">{i18n.t('training.title')}</AppText>

      {skills.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 36 }}>
          <Avatar icon="target" size={88} />
          <AppText variant="title">{i18n.t('training.emptyTitle')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('training.emptyText')}
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Button
              label={i18n.t('training.newSkill')}
              icon="plus"
              size="lg"
              onPress={onNewSkill}
            />
          </View>
        </View>
      ) : (
        <>
          <Button label={i18n.t('training.startSession')} icon="play" size="lg" onPress={onStart} />
          <View style={{ gap: 8 }}>
            {skills.map((skill) => (
              <Pressable
                key={skill.id}
                accessibilityRole="button"
                accessibilityLabel={skill.name}
                onPress={() => {
                  onOpenSkill(skill.id);
                }}
              >
                <Card variant="flat">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <AppText weight={600} style={{ flex: 1, fontSize: 16 }}>
                      {skill.name}
                    </AppText>
                    <Tag
                      tone={skill.status === 'overdue' ? 'warn' : 'accent'}
                      label={i18n.t(STATUS_KEYS[skill.status])}
                    />
                  </View>
                  <AppText variant="muted">
                    {[skill.levelText, skill.lastText]
                      .filter((p): p is string => p !== null)
                      .join(' · ')}
                  </AppText>
                  <AppText variant="muted" style={{ fontSize: 12 }}>
                    {skill.sessionsText}
                  </AppText>
                </Card>
              </Pressable>
            ))}
          </View>
          <Button
            label={i18n.t('training.newSkill')}
            tone="ghost"
            icon="plus"
            onPress={onNewSkill}
          />
        </>
      )}
    </Screen>
  );
}
