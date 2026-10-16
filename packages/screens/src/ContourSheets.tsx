import { AppText, Button, Card, ListRow, Sheet, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

export interface ContourChoiceSheetProps {
  readonly visible: boolean;
  readonly placeName: string;
  /** "Контур: 33 га" or "Граница: круг 300 м". */
  readonly currentLine: string;
  readonly hasContour: boolean;
  readonly onFromMap: () => void;
  readonly onDraw: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/** How to give a place its real boundary: take it from the map, or draw it (two clear choices). */
export function ContourChoiceSheet(props: ContourChoiceSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={props.placeName}>
      <AppText variant="muted">{props.currentLine}</AppText>
      <Card variant="soft">
        <AppText weight={600}>{i18n.t('contour.fromMap')}</AppText>
        <AppText variant="muted">{i18n.t('contour.fromMapHint')}</AppText>
        <View style={{ marginTop: 8 }}>
          <Button label={i18n.t('contour.fromMap')} icon="map" onPress={props.onFromMap} />
        </View>
      </Card>
      <Button
        label={i18n.t(props.hasContour ? 'contour.edit' : 'contour.draw')}
        tone="ghost"
        icon="edit"
        onPress={props.onDraw}
      />
      {props.hasContour ? (
        <Button
          label={i18n.t('contour.remove')}
          tone="ghost"
          icon="trash"
          onPress={props.onRemove}
        />
      ) : null}
    </Sheet>
  );
}

export interface ContourCandidate {
  readonly key: string;
  /** "Парк 900-летия · 33 га". */
  readonly line: string;
}

export interface ContourCandidatesSheetProps {
  readonly visible: boolean;
  readonly placeName: string;
  /** `null` while the map is being asked; an empty list when it knows nothing here; `'offline'` on failure. */
  readonly state: 'loading' | 'offline' | { readonly candidates: readonly ContourCandidate[] };
  readonly onPick: (key: string) => void;
  readonly onDraw: () => void;
  readonly onClose: () => void;
}

/** What the map knows around the place: pick one, or draw by hand. Failure is a quiet note (G-13). */
export function ContourCandidatesSheet(props: ContourCandidatesSheetProps) {
  const i18n = useI18n();
  const { state } = props;
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={props.placeName}>
      {state === 'loading' ? (
        <AppText variant="muted">{i18n.t('contour.searching')}</AppText>
      ) : null}
      {state === 'offline' ? <AppText variant="muted">{i18n.t('contour.offline')}</AppText> : null}
      {typeof state === 'object' && state.candidates.length === 0 ? (
        <AppText variant="muted">{i18n.t('contour.noneFound')}</AppText>
      ) : null}
      {typeof state === 'object' && state.candidates.length > 0 ? (
        <>
          <AppText weight={600}>{i18n.t('contour.found')}</AppText>
          <AppText variant="muted">{i18n.t('contour.foundHint')}</AppText>
          {state.candidates.map((candidate) => (
            <ListRow
              key={candidate.key}
              icon="map"
              title={candidate.line}
              onPress={() => {
                props.onPick(candidate.key);
              }}
            />
          ))}
        </>
      ) : null}
      <Button label={i18n.t('contour.draw')} tone="ghost" icon="edit" onPress={props.onDraw} />
    </Sheet>
  );
}
