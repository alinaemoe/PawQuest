import { AppText, Button, Sheet, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';

import { ObservationFields, type ObservationDraft } from './ObservationFields';

export interface EventDetailsSheetProps {
  readonly visible: boolean;
  /** "Собака · 14:05": what was recorded and when. */
  readonly title: string;
  /** "Заполнено 3 из 8 полей". */
  readonly filledLine: string;
  readonly initial: ObservationDraft;
  readonly typeChoices: readonly { readonly id: string; readonly label: string }[];
  /** Closing the sheet (swipe, back, the dimmed area or the button) saves what was entered. */
  readonly onSave: (draft: ObservationDraft) => void;
  readonly onDelete: () => void;
}

/**
 * The details of one event (spec S04), opened by a long press on its button, a marker or a row.
 * There is no "Save": the event is already recorded, closing keeps the details, and nothing in
 * it is required. Mount it with a `key` per event so the form starts from that event.
 */
export function EventDetailsSheet({
  visible,
  title,
  filledLine,
  initial,
  typeChoices,
  onSave,
  onDelete,
}: EventDetailsSheetProps) {
  const i18n = useI18n();
  const [draft, setDraft] = useState<ObservationDraft>(initial);
  const close = (): void => {
    onSave(draft);
  };
  return (
    <Sheet visible={visible} onClose={close} title={title}>
      <AppText variant="muted">{filledLine}</AppText>
      <ObservationFields
        draft={draft}
        onChange={(changes) => {
          setDraft((d) => ({ ...d, ...changes }));
        }}
        typeChoices={typeChoices}
        showWhen={false}
      />
      <Button label={i18n.t('common.done')} size="lg" onPress={close} />
      <Button label={i18n.t('walk.eventDelete')} tone="ghost" icon="trash" onPress={onDelete} />
    </Sheet>
  );
}
