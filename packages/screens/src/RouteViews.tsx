import {
  AppText,
  Button,
  Card,
  Chip,
  ListRow,
  Screen,
  Sheet,
  TextField,
  useI18n,
} from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

export interface RouteRowModel {
  readonly id: string;
  readonly name: string;
  /** "900 м · 5 проходов · обычно 11 мин". */
  readonly summary: string;
}

export interface RoutesScreenProps {
  readonly routes: readonly RouteRowModel[];
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
}

/** Dog -> Routes: the ways that are walked again and again (D-61). */
export function RoutesScreen(props: RoutesScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('routes.title')}</AppText>
      <AppText variant="muted">{i18n.t('routes.hint')}</AppText>
      {props.routes.length === 0 ? (
        <Card variant="soft">
          <AppText weight={600}>{i18n.t('routes.emptyTitle')}</AppText>
          <AppText variant="muted">{i18n.t('routes.emptyText')}</AppText>
        </Card>
      ) : (
        props.routes.map((route) => (
          <ListRow
            key={route.id}
            icon="map"
            title={route.name}
            subtitle={route.summary}
            onPress={() => {
              props.onOpen(route.id);
            }}
          />
        ))
      )}
    </Screen>
  );
}

export interface RoutePassRow {
  readonly key: string;
  /** "Пятница, 16 октября · 10:54". */
  readonly when: string;
  /** "11 мин · туда", "14 мин · обратно · 1 остановка". */
  readonly detail: string;
}

export interface RouteDetailsModel {
  readonly id: string;
  readonly name: string;
  /** "900 м · из дома в магазин". */
  readonly lengthLine: string;
  /** "5 проходов, обычно 11 мин (9–14)"; the sentence already carries "мало данных". */
  readonly statsLine: string;
  /** "Туда 3, обратно 2 · с остановкой 1". */
  readonly directionsLine: string;
  readonly passes: readonly RoutePassRow[];
}

export interface RouteDetailsSheetProps {
  readonly route: RouteDetailsModel | null;
  readonly onClose: () => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
}

/** One route: its length, the usual time with the spread, and every pass by date. */
export function RouteDetailsSheet({ route, onClose, onRename, onDelete }: RouteDetailsSheetProps) {
  const i18n = useI18n();
  const [name, setName] = useState<string | null>(null);
  if (route === null) {
    return null;
  }
  const editing = name !== null;
  return (
    <Sheet visible onClose={onClose} title={route.name}>
      <AppText>{route.lengthLine}</AppText>
      <AppText weight={600}>{route.statsLine}</AppText>
      <AppText variant="muted">{route.directionsLine}</AppText>
      <View style={{ gap: 4 }}>
        <AppText variant="eyebrow">{i18n.t('routes.passes')}</AppText>
        {route.passes.length === 0 ? (
          <AppText variant="muted">{i18n.t('routes.noPasses')}</AppText>
        ) : (
          route.passes.map((pass) => (
            <AppText key={pass.key}>
              {pass.when} · {pass.detail}
            </AppText>
          ))
        )}
      </View>
      {editing ? (
        <>
          <TextField
            label={i18n.t('routes.name')}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
          />
          <Button
            label={i18n.t('common.save')}
            onPress={() => {
              onRename(name);
              setName(null);
            }}
          />
        </>
      ) : (
        <Button
          label={i18n.t('routes.rename')}
          tone="ghost"
          icon="edit"
          onPress={() => {
            setName(route.name);
          }}
        />
      )}
      <Button label={i18n.t('routes.delete')} tone="ghost" icon="trash" onPress={onDelete} />
    </Sheet>
  );
}

export interface NewRouteSheetProps {
  readonly visible: boolean;
  /** The name offered from the places at the ends, or "". */
  readonly suggestedName: string;
  /** "900 м · 3 раза". */
  readonly facts: string;
  readonly onSave: (name: string) => void;
  readonly onClose: () => void;
}

/** "Назвать маршрут?" from the summary of a walk: one field, the name is already filled in when it can be. */
export function NewRouteSheet(props: NewRouteSheetProps) {
  const i18n = useI18n();
  const [name, setName] = useState(props.suggestedName);
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={i18n.t('routes.new')}>
      <AppText variant="muted">{props.facts}</AppText>
      <TextField
        label={i18n.t('routes.name')}
        value={name}
        onChangeText={setName}
        placeholder={i18n.t('routes.namePlaceholder')}
        autoFocus
        maxLength={60}
      />
      <Button
        label={i18n.t('common.save')}
        size="lg"
        onPress={() => {
          if (name.trim() !== '') {
            props.onSave(name);
          }
        }}
      />
    </Sheet>
  );
}
