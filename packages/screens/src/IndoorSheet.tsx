import { AppText, Button, Sheet, useI18n } from '@pawquest/rn-ui';

export interface IndoorSheetProps {
  readonly visible: boolean;
  /** "Магазин · 10:54, 37 мин". */
  readonly title: string;
  /** The time is already marked as spent indoors: the sheet offers to take it back. */
  readonly marked: boolean;
  readonly onMark: () => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
}

/** "Вы были внутри без собаки?": the owner's own correction, never guessed by the app. */
export function IndoorSheet(props: IndoorSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={props.title}>
      <AppText variant="muted">
        {i18n.t(props.marked ? 'indoor.markedText' : 'indoor.text')}
      </AppText>
      {props.marked ? (
        <Button label={i18n.t('indoor.clear')} size="lg" onPress={props.onClear} />
      ) : (
        <Button label={i18n.t('indoor.mark')} size="lg" onPress={props.onMark} />
      )}
      <Button label={i18n.t('common.close')} tone="ghost" onPress={props.onClose} />
    </Sheet>
  );
}
