import type { TrainingContext } from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Card, Chip, ListRow, Sheet, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

function useResetOnOpen(visible: boolean, reset: () => void): void {
  useEffect(() => {
    if (visible) {
      reset();
    }
    // reset only when the sheet opens, not on every render
  }, [visible]);
}

const CONTEXTS: readonly TrainingContext[] = ['home', 'yard', 'park', 'street', 'other'];
const REWARDS: readonly string[] = ['treat', 'toy', 'praise'];
const DISTRACTIONS: readonly number[] = [1, 2, 3, 4, 5];

export interface TemplateChoice {
  readonly key: string;
  readonly name: string;
  readonly criterion: string;
}

export interface TemplateSheetProps {
  readonly visible: boolean;
  readonly templates: readonly TemplateChoice[];
  readonly onClose: () => void;
  readonly onChoose: (key: string, customName: string) => void;
}

/** "New skill": pick a template; the custom template also asks for a name. */
export function TemplateSheet({ visible, templates, onClose, onChoose }: TemplateSheetProps) {
  const i18n = useI18n();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  useResetOnOpen(visible, () => {
    setCustom(false);
    setName('');
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('training.chooseTemplate')}>
      {custom ? (
        <View style={{ gap: 12 }}>
          <TextField
            label={i18n.t('training.skillName')}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <Button
            label={i18n.t('common.save')}
            disabled={name.trim() === ''}
            onPress={() => {
              onChoose('custom', name.trim());
            }}
          />
        </View>
      ) : (
        <View>
          {templates.map((t, index) => (
            <ListRow
              key={t.key}
              icon="target"
              title={t.name}
              subtitle={t.criterion}
              divider={index < templates.length - 1}
              onPress={() => {
                if (t.key === 'custom') {
                  setCustom(true);
                } else {
                  onChoose(t.key, '');
                }
              }}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

export interface PickerSkill {
  readonly id: string;
  readonly name: string;
  /** What "same as last time" would be; null for a skill without finished sessions. */
  readonly repeat: string | null;
  /** Shown when there is nothing to repeat: the current step. */
  readonly levelText: string | null;
}

export interface SkillPickerSheetProps {
  readonly visible: boolean;
  readonly skills: readonly PickerSkill[];
  readonly onClose: () => void;
  /** One tap: start straight away with the last settings (or the defaults). */
  readonly onQuickStart: (skillId: string) => void;
  /** Open the preparation sheet for that skill. */
  readonly onAdjust: (skillId: string) => void;
  readonly onNewSkill: () => void;
}

/** The skill picker: the most recent skill first and a one-tap "same as last time" (S09-Q, S11-P). */
export function SkillPickerSheet({
  visible,
  skills,
  onClose,
  onQuickStart,
  onAdjust,
  onNewSkill,
}: SkillPickerSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('training.pickSkill')}>
      <View>
        {skills.map((skill, index) => (
          <ListRow
            key={skill.id}
            icon="play"
            title={skill.name}
            subtitle={skill.repeat ?? skill.levelText ?? undefined}
            divider={index < skills.length - 1}
            right={
              <Chip
                size="sm"
                label={i18n.t('training.change')}
                onPress={() => {
                  onAdjust(skill.id);
                }}
              />
            }
            onPress={() => {
              onQuickStart(skill.id);
            }}
          />
        ))}
      </View>
      <Button label={i18n.t('training.newSkill')} tone="ghost" icon="plus" onPress={onNewSkill} />
    </Sheet>
  );
}

export interface PrepSettings {
  readonly levelId: string | null;
  readonly context: TrainingContext | null;
  readonly distraction: number | null;
  readonly reward: string | null;
}

export interface PrepSheetProps {
  readonly visible: boolean;
  readonly skillName: string;
  readonly levels: readonly { readonly id: string; readonly title: string }[];
  readonly initial: PrepSettings;
  readonly onClose: () => void;
  readonly onStart: (settings: PrepSettings) => void;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{title}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Everything is chosen before the first tap (S11-P): step, place, distraction, reward. */
export function PrepSheet({
  visible,
  skillName,
  levels,
  initial,
  onClose,
  onStart,
}: PrepSheetProps) {
  const i18n = useI18n();
  const [settings, setSettings] = useState<PrepSettings>(initial);
  useResetOnOpen(visible, () => {
    setSettings(initial);
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={`${skillName} · ${i18n.t('prep.title')}`}>
      {levels.length > 1 ? (
        <Group title={i18n.t('prep.level')}>
          {levels.map((level) => (
            <Chip
              key={level.id}
              label={level.title}
              selected={settings.levelId === level.id}
              onPress={() => {
                setSettings({ ...settings, levelId: level.id });
              }}
            />
          ))}
        </Group>
      ) : null}
      <Group title={i18n.t('prep.context')}>
        {CONTEXTS.map((c) => (
          <Chip
            key={c}
            label={i18n.t(`ctx.${c}` as MessageKey)}
            selected={settings.context === c}
            onPress={() => {
              setSettings({ ...settings, context: settings.context === c ? null : c });
            }}
          />
        ))}
      </Group>
      <Group title={i18n.t('prep.distraction')}>
        {DISTRACTIONS.map((d) => (
          <Chip
            key={d}
            label={`D${String(d)}`}
            selected={settings.distraction === d}
            onPress={() => {
              setSettings({ ...settings, distraction: settings.distraction === d ? null : d });
            }}
          />
        ))}
      </Group>
      <Group title={i18n.t('prep.reward')}>
        {REWARDS.map((r) => (
          <Chip
            key={r}
            label={i18n.t(`reward.${r}` as MessageKey)}
            selected={settings.reward === r}
            onPress={() => {
              setSettings({ ...settings, reward: settings.reward === r ? null : r });
            }}
          />
        ))}
      </Group>
      <Button
        label={i18n.t('prep.start')}
        icon="play"
        size="lg"
        onPress={() => {
          onStart(settings);
        }}
      />
    </Sheet>
  );
}

export interface SummaryModel {
  readonly skillName: string;
  readonly percent: number | null;
  readonly successful: number;
  readonly partial: number;
  readonly unsuccessful: number;
  /** "В прошлый раз (3 дня назад): 3 из 6", null when there is nothing to compare with. */
  readonly lastText: string | null;
  readonly suggestedQuality: number | null;
  /** The "move up a step?" hint of A-11, null when not ready. */
  readonly readyText: string | null;
}

export interface SummarySheetProps {
  readonly visible: boolean;
  readonly summary: SummaryModel | null;
  readonly onSave: (result: {
    readonly quality: number | null;
    readonly notes: string;
    readonly moveUp: boolean;
  }) => void;
  readonly onDiscard: () => void;
}

/** After "Stop" (S11-7): the numbers, last time, a rating prefilled from the share, a note. */
export function SummarySheet({ visible, summary, onSave, onDiscard }: SummarySheetProps) {
  const i18n = useI18n();
  const [quality, setQuality] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [moveUp, setMoveUp] = useState(false);
  useResetOnOpen(visible, () => {
    setQuality(summary?.suggestedQuality ?? null);
    setNotes('');
    setMoveUp(false);
  });
  if (summary === null) {
    return null;
  }
  return (
    <Sheet
      visible={visible}
      // closing by swipe or back keeps the session: nothing a user did is lost by accident
      onClose={() => {
        onSave({ quality, notes: notes.trim(), moveUp });
      }}
      title={`${summary.skillName} · ${i18n.t('sum.title')}`}
    >
      <View style={{ alignItems: 'center', gap: 4 }}>
        {summary.percent === null ? null : (
          <AppText variant="numBig" style={{ fontSize: 34, lineHeight: 42 }}>
            {i18n.t('sum.share', { pct: summary.percent })}
          </AppText>
        )}
        <AppText variant="muted">
          {i18n.t('sum.counts', {
            ok: summary.successful,
            part: summary.partial,
            fail: summary.unsuccessful,
          })}
        </AppText>
        {summary.lastText === null ? null : <AppText variant="muted">{summary.lastText}</AppText>}
      </View>

      {summary.readyText === null ? null : (
        <Card variant="stripe">
          <AppText>{summary.readyText}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Chip
              size="sm"
              label={i18n.t('sum.readyYes')}
              selected={moveUp}
              onPress={() => {
                setMoveUp(true);
              }}
            />
            <Chip
              size="sm"
              label={i18n.t('sum.readyNo')}
              selected={!moveUp}
              onPress={() => {
                setMoveUp(false);
              }}
            />
          </View>
        </Card>
      )}

      <Group title={i18n.t('sum.quality')}>
        {[1, 2, 3, 4, 5].map((q) => (
          <Chip
            key={q}
            label={String(q)}
            selected={quality === q}
            onPress={() => {
              setQuality(quality === q ? null : q);
            }}
          />
        ))}
      </Group>
      <TextField label={i18n.t('sum.note')} value={notes} onChangeText={setNotes} multiline />
      <Button
        label={i18n.t('common.save')}
        onPress={() => {
          onSave({ quality, notes: notes.trim(), moveUp });
        }}
      />
      <Button label={i18n.t('sum.discard')} tone="ghost" onPress={onDiscard} />
    </Sheet>
  );
}
