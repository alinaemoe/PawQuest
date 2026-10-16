import { AppText, Button, Chip, Screen, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

import { ObservationFields, type ObservationDraft } from './ObservationFields';

export type { ObservationDraft } from './ObservationFields';

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

/**
 * The observation form (spec S12-F): what came before, what the dog did, what happened next, and
 * the owner's own thought kept apart. Nothing is required; saving works with any subset.
 */
export function ObservationScreen(props: ObservationScreenProps) {
  const i18n = useI18n();
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

      <ObservationFields draft={draft} onChange={set} typeChoices={props.typeChoices} showWhen />

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
