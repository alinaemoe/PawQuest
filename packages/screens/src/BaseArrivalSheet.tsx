import { AppText, Button, Sheet, useI18n } from '@pawquest/rn-ui';

export interface BaseArrivalSheetProps {
  readonly visible: boolean;
  /** The base the owner came to ("Мама"). */
  readonly placeName: string;
  /** How long they have been there, already worded ("18 мин"). */
  readonly stay: string;
  readonly onFinish: () => void;
  readonly onKeepWalking: () => void;
  /** No base is marked: the walk is back where it began. */
  readonly fromStart?: boolean;
  /** Mark this spot as "Дом" and finish (only when `fromStart`). */
  readonly onMarkHome?: () => void;
}

/** "Вы пришли к маме. Завершить прогулку?": a question, never a decision (G-18). */
export function BaseArrivalSheet(props: BaseArrivalSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onKeepWalking}
      title={
        props.fromStart === true
          ? i18n.t('arrival.startTitle')
          : i18n.t('arrival.title', { place: props.placeName })
      }
    >
      <AppText>
        {i18n.t(props.fromStart === true ? 'arrival.startText' : 'arrival.text', {
          stay: props.stay,
        })}
      </AppText>
      <Button label={i18n.t('arrival.finish')} size="lg" icon="stop" onPress={props.onFinish} />
      {props.fromStart === true && props.onMarkHome !== undefined ? (
        <Button
          label={i18n.t('arrival.markHome')}
          tone="ghost"
          icon="home"
          onPress={props.onMarkHome}
        />
      ) : null}
      <Button label={i18n.t('arrival.keep')} tone="ghost" onPress={props.onKeepWalking} />
    </Sheet>
  );
}
