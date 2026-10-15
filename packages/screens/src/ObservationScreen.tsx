import type { DistanceBucket, Outcome } from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Card, Chip, Screen, TextField, useI18n, useTheme } from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

export interface ObservationDraft {
  readonly typeId: string;
  readonly distanceBucket: DistanceBucket | null;
  readonly reaction: number | null;
  readonly distraction: number | null;
  readonly behaviors: readonly string[];
  readonly ownerActions: readonly string[];
  readonly outcome: Outcome | null;
  readonly recoveryText: string;
  readonly antecedent: string;
  readonly note: string;
  readonly thought: string;
  /** How long ago it happened, in ms; 0 means now. */
  readonly agoMs: number;
}

export interface ObservationScreenProps {
  readonly initial: ObservationDraft;
  /** The types offered as "who or what", already labelled. */
  readonly typeChoices: readonly { readonly id: string; readonly label: string }[];
  /** Editing an existing entry: shows the filled counter and a delete button. */
  readonly existing: { readonly filledLine: string } | null;
  readonly onSave: (draft: ObservationDraft) => void;
  readonly onDelete: () => void;
  readonly onBack: () => void;
}

const BEHAVIORS = [
  'stare',
  'freeze',
  'bark',
  'pull',
  'jump',
  'whine',
  'runAside',
  'ignore',
] as const;
const ACTIONS = ['moveAway', 'redirect', 'command', 'treat', 'turn', 'nothing'] as const;
const OUTCOMES: readonly Outcome[] = ['calmed_fast', 'took_time', 'ongoing', 'unknown'];
const BUCKETS: readonly DistanceBucket[] = ['far', 'mid', 'near'];
const SCALE = [1, 2, 3, 4, 5] as const;
const HOUR = 3_600_000;
const WHEN: readonly { readonly key: MessageKey; readonly ms: number }[] = [
  { key: 'walk.endedNow', ms: 0 },
  { key: 'walk.ended1h', ms: HOUR },
  { key: 'walk.ended3h', ms: 3 * HOUR },
  { key: 'walk.endedYesterday', ms: 24 * HOUR },
];

function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Block({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: 'soft';
  children: React.ReactNode;
}) {
  return (
    <Card variant={tone === 'soft' ? 'soft' : 'flat'}>
      <AppText variant="title" style={{ marginBottom: 6 }}>
        {title}
      </AppText>
      <View style={{ gap: 14 }}>{children}</View>
    </Card>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{title}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/**
 * The observation form (spec S12-F): what came before, what the dog did, what happened next, and
 * the owner's own thought kept apart. Nothing is required; saving works with any subset.
 */
export function ObservationScreen(props: ObservationScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const [draft, setDraft] = useState<ObservationDraft>(props.initial);
  const set = (changes: Partial<ObservationDraft>): void => {
    setDraft({ ...draft, ...changes });
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
        {props.existing === null ? null : (
          <AppText variant="muted">{props.existing.filledLine}</AppText>
        )}
      </View>
      <AppText variant="numBig">
        {props.existing === null ? i18n.t('diary.new') : i18n.t('diary.edit')}
      </AppText>

      <Block title={i18n.t('abc.before')}>
        <Group title={i18n.t('abc.trigger')}>
          {props.typeChoices.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              selected={draft.typeId === t.id}
              onPress={() => {
                set({ typeId: t.id });
              }}
            />
          ))}
        </Group>
        <Group title={i18n.t('abc.distance')}>
          {BUCKETS.map((b) => (
            <Chip
              key={b}
              label={i18n.t(`abc.${b}` as MessageKey)}
              selected={draft.distanceBucket === b}
              onPress={() => {
                set({ distanceBucket: draft.distanceBucket === b ? null : b });
              }}
            />
          ))}
        </Group>
        <View style={{ gap: 8 }}>
          <Group title={i18n.t('abc.distraction')}>
            {SCALE.map((n) => (
              <Chip
                key={n}
                label={`D${String(n)}`}
                selected={draft.distraction === n}
                onPress={() => {
                  set({ distraction: draft.distraction === n ? null : n });
                }}
              />
            ))}
          </Group>
          {draft.distraction === null ? null : (
            <AppText variant="muted">
              {i18n.t(`dist.${String(draft.distraction)}` as MessageKey)}
            </AppText>
          )}
        </View>
        <TextField
          label={i18n.t('abc.antecedent')}
          value={draft.antecedent}
          onChangeText={(antecedent) => {
            set({ antecedent });
          }}
        />
      </Block>

      <Block title={i18n.t('abc.behavior')}>
        <View style={{ gap: 8 }}>
          <Group title={i18n.t('abc.reaction')}>
            {SCALE.map((n) => (
              <Chip
                key={n}
                label={`R${String(n)}`}
                selected={draft.reaction === n}
                onPress={() => {
                  set({ reaction: draft.reaction === n ? null : n });
                }}
              />
            ))}
          </Group>
          {draft.reaction === null ? null : (
            <AppText variant="muted">
              {i18n.t(`react.${String(draft.reaction)}` as MessageKey)}
            </AppText>
          )}
        </View>
        <Group title={i18n.t('abc.behaviors')}>
          {BEHAVIORS.map((b) => (
            <Chip
              key={b}
              label={i18n.t(`beh.${b}` as MessageKey)}
              selected={draft.behaviors.includes(b)}
              onPress={() => {
                set({ behaviors: toggle(draft.behaviors, b) });
              }}
            />
          ))}
        </Group>
      </Block>

      <Block title={i18n.t('abc.after')}>
        <Group title={i18n.t('abc.ownerActions')}>
          {ACTIONS.map((a) => (
            <Chip
              key={a}
              label={i18n.t(`act.${a}` as MessageKey)}
              selected={draft.ownerActions.includes(a)}
              onPress={() => {
                set({ ownerActions: toggle(draft.ownerActions, a) });
              }}
            />
          ))}
        </Group>
        <Group title={i18n.t('abc.outcome')}>
          {OUTCOMES.map((o) => (
            <Chip
              key={o}
              label={i18n.t(`out.${o}` as MessageKey)}
              selected={draft.outcome === o}
              onPress={() => {
                set({ outcome: draft.outcome === o ? null : o });
              }}
            />
          ))}
        </Group>
        <TextField
          label={i18n.t('abc.recovery')}
          value={draft.recoveryText}
          onChangeText={(recoveryText) => {
            set({ recoveryText });
          }}
          keyboardType="number-pad"
          maxLength={4}
        />
      </Block>

      <Block title={i18n.t('abc.thought')} tone="soft">
        <AppText variant="muted" style={{ fontStyle: 'italic', color: colors.muted }}>
          {i18n.t('abc.thoughtHint')}
        </AppText>
        <TextField
          value={draft.thought}
          onChangeText={(thought) => {
            set({ thought });
          }}
          multiline
        />
      </Block>

      <Group title={i18n.t('abc.when')}>
        {WHEN.map((w) => (
          <Chip
            key={w.key}
            label={i18n.t(w.key)}
            selected={draft.agoMs === w.ms}
            onPress={() => {
              set({ agoMs: w.ms });
            }}
          />
        ))}
      </Group>
      <TextField
        label={i18n.t('abc.note')}
        value={draft.note}
        onChangeText={(note) => {
          set({ note });
        }}
        multiline
      />

      <Button
        label={i18n.t('common.save')}
        size="lg"
        onPress={() => {
          props.onSave(draft);
        }}
      />
      {props.existing === null ? null : (
        <Button label={i18n.t('diary.delete')} tone="ghost" icon="trash" onPress={props.onDelete} />
      )}
    </Screen>
  );
}
