import { guessCategory } from '@pawquest/core';
import { PLACE_CATEGORIES, PLACE_DEFAULT_RADIUS_M, type PlaceCategory } from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  ListRow,
  Screen,
  Sheet,
  TextField,
  useI18n,
} from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  categoryFromGuess,
  categoryLabel,
  filterPlaces,
  groupPlaces,
  stepRadius,
  withQualifier,
  type PlaceRowModel,
  type TidyPairModel,
} from './placesModel';

const QUALIFIERS: readonly MessageKey[] = [
  'place.new.q.home',
  'place.new.q.school',
  'place.new.q.river',
  'place.new.q.new',
];

/** "Размер места (радиус): 300 м" with smaller and larger steps. */
function RadiusStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (radiusM: number) => void;
}) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{i18n.t('place.radius.title')}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Chip
          label={i18n.t('place.radius.less')}
          onPress={() => {
            onChange(stepRadius(value, -1));
          }}
        />
        <AppText variant="numBig" style={{ fontSize: 22, minWidth: 90, textAlign: 'center' }}>
          {i18n.formatDistance(value)}
        </AppText>
        <Chip
          label={i18n.t('place.radius.more')}
          onPress={() => {
            onChange(stepRadius(value, 1));
          }}
        />
      </View>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {i18n.t('place.radius.hint')}
      </AppText>
    </View>
  );
}

export interface PlacesScreenProps {
  readonly rows: readonly PlaceRowModel[];
  readonly tidy: readonly TidyPairModel[];
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
  readonly onAdd: () => void;
  readonly onMerge: (keepId: string, otherId: string) => void;
}

/** The places library (S14-Lib): grouped by type with visit counts, search, and a tidy-up block. */
export function PlacesScreen({ rows, tidy, onBack, onOpen, onAdd, onMerge }: PlacesScreenProps) {
  const i18n = useI18n();
  const [query, setQuery] = useState('');
  const shown = filterPlaces(rows, query);
  const groups = groupPlaces(shown, i18n);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('places.title')}</AppText>

      {rows.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 36 }}>
          <Avatar icon="pin" size={88} />
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {i18n.t('places.empty')}
          </AppText>
        </View>
      ) : (
        <>
          {tidy.length === 0 ? null : (
            <Card variant="stripe">
              <AppText variant="eyebrow">{i18n.t('places.tidy')}</AppText>
              {tidy.map((pair) => (
                <View key={pair.key} style={{ gap: 8, marginTop: 6 }}>
                  <AppText>{pair.text}</AppText>
                  <View style={{ flexDirection: 'row' }}>
                    <Chip
                      size="sm"
                      label={i18n.t('places.merge')}
                      onPress={() => {
                        onMerge(pair.keepId, pair.otherId);
                      }}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={i18n.t('places.search')}
            maxLength={40}
          />
          {groups.length === 0 ? (
            <AppText variant="muted">{i18n.t('places.noMatch')}</AppText>
          ) : (
            groups.map((group) => (
              <View key={group.category}>
                <AppText variant="eyebrow" style={{ marginBottom: 4 }}>
                  {group.label}
                </AppText>
                {group.rows.map((row, index) => (
                  <ListRow
                    key={row.id}
                    icon="pin"
                    title={row.name}
                    subtitle={row.subtitle}
                    divider={index < group.rows.length - 1}
                    onPress={() => {
                      onOpen(row.id);
                    }}
                  />
                ))}
              </View>
            ))
          )}
        </>
      )}
      <Button label={i18n.t('places.add')} icon="pin" onPress={onAdd} />
    </Screen>
  );
}

export interface NewPlaceSheetProps {
  readonly visible: boolean;
  /** The type preselected when the sheet opens (a walk that only had a type), else a park. */
  readonly initialCategory?: PlaceCategory;
  /** A size to start from (a place proposed from the walks), instead of the type's default. */
  readonly initialRadiusM?: number;
  /** False when the position is unknown: the sheet explains instead of saving. */
  readonly hasPosition: boolean;
  readonly onClose: () => void;
  /** A saved place the typed name looks like, or null. */
  readonly findSimilar: (
    name: string,
    category: PlaceCategory,
  ) => { readonly id: string; readonly name: string } | null;
  readonly onSave: (input: { category: PlaceCategory; name: string; radiusM: number }) => void;
  /** "Yes, the same": use the saved place and remember the typed text as its alias. */
  readonly onUseExisting: (id: string, typed: string) => void;
}

/** A new place (S14-A): the type by tiles, an optional name with qualifier chips, duplicate check. */
export function NewPlaceSheet({
  visible,
  initialCategory = 'park',
  initialRadiusM,
  hasPosition,
  onClose,
  findSimilar,
  onSave,
  onUseExisting,
}: NewPlaceSheetProps) {
  const i18n = useI18n();
  const [category, setCategory] = useState<PlaceCategory>('park');
  const [name, setName] = useState('');
  const [radiusM, setRadiusM] = useState<number>(
    initialRadiusM ?? PLACE_DEFAULT_RADIUS_M[initialCategory],
  );
  // a proposed size is kept when the owner changes the type
  const [radiusTouched, setRadiusTouched] = useState(initialRadiusM !== undefined);
  const [askedFor, setAskedFor] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setCategory(initialCategory);
      setRadiusM(initialRadiusM ?? PLACE_DEFAULT_RADIUS_M[initialCategory]);
      setRadiusTouched(initialRadiusM !== undefined);
      setName('');
      setAskedFor(null);
    }
    // reset only when the sheet opens
  }, [visible]);

  const guess = guessCategory(name);
  const recognized = guess === null ? null : categoryFromGuess(guess);
  const typeLabel = categoryLabel(category, i18n);
  const similar = name.trim() === '' ? null : findSimilar(name, recognized ?? category);
  const asking = similar !== null && askedFor !== name;

  const typeChanged = (next: PlaceCategory): void => {
    setCategory(next);
    if (!radiusTouched) {
      setRadiusM(PLACE_DEFAULT_RADIUS_M[next]);
    }
  };
  const nameChanged = (text: string): void => {
    setName(text);
    setAskedFor(null);
    const found = guessCategory(text);
    if (found !== null) {
      typeChanged(categoryFromGuess(found));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('place.new.title')}>
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('place.new.type')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PLACE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={categoryLabel(c, i18n)}
              selected={category === c}
              onPress={() => {
                typeChanged(c);
              }}
            />
          ))}
        </View>
        {recognized === null ? null : (
          <AppText variant="muted">
            {i18n.t('place.new.recognized', { type: categoryLabel(recognized, i18n) })}
          </AppText>
        )}
      </View>
      <RadiusStepper
        value={radiusM}
        onChange={(next) => {
          setRadiusM(next);
          setRadiusTouched(true);
        }}
      />
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('place.new.name')}</AppText>
        <TextField value={name} onChangeText={nameChanged} placeholder={typeLabel} maxLength={40} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {QUALIFIERS.map((key) => (
            <Chip
              key={key}
              size="sm"
              label={i18n.t(key)}
              onPress={() => {
                nameChanged(withQualifier(name, typeLabel, i18n.t(key)));
              }}
            />
          ))}
        </View>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {i18n.t('place.new.nameHint')}
        </AppText>
      </View>
      {asking ? (
        <Card variant="stripe">
          <AppText>{i18n.t('place.new.similar', { name: similar.name })}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Chip
              size="sm"
              label={i18n.t('place.new.same')}
              onPress={() => {
                onUseExisting(similar.id, name);
              }}
            />
            <Chip
              size="sm"
              label={i18n.t('place.new.separate')}
              onPress={() => {
                setAskedFor(name);
              }}
            />
          </View>
        </Card>
      ) : null}
      <AppText variant="muted">
        {hasPosition ? i18n.t('place.new.here') : i18n.t('place.new.noPosition')}
      </AppText>
      <Button
        label={i18n.t('place.new.save')}
        disabled={!hasPosition || asking}
        onPress={() => {
          onSave({ category, name, radiusM });
        }}
      />
    </Sheet>
  );
}

export interface PlaceSheetProps {
  readonly place: {
    readonly id: string;
    readonly name: string;
    readonly category: PlaceCategory;
    readonly radiusM: number;
    readonly subtitle: string;
    readonly hasContour: boolean;
    readonly boundaryLine: string;
  } | null;
  readonly onContour: (id: string) => void;
  readonly onClose: () => void;
  readonly onSave: (
    id: string,
    patch: { name: string; category: PlaceCategory; radiusM: number },
  ) => void;
  readonly onDelete: (id: string) => void;
}

/** One saved place: rename, change the type, delete (the records stay, S14-Del). */
export function PlaceSheet({ place, onContour, onClose, onSave, onDelete }: PlaceSheetProps) {
  const i18n = useI18n();
  const [name, setName] = useState(place?.name ?? '');
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? 'other');
  const [radiusM, setRadiusM] = useState(place?.radiusM ?? 60);
  useEffect(() => {
    if (place !== null) {
      setName(place.name);
      setCategory(place.category);
      setRadiusM(place.radiusM);
    }
    // refill only when another place is opened
  }, [place?.id]);
  if (place === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={place.name}>
      <AppText variant="muted">{place.subtitle}</AppText>
      <TextField
        label={i18n.t('place.card.rename')}
        value={name}
        onChangeText={setName}
        maxLength={40}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PLACE_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={categoryLabel(c, i18n)}
            selected={category === c}
            onPress={() => {
              setCategory(c);
            }}
          />
        ))}
      </View>
      {place.hasContour ? null : <RadiusStepper value={radiusM} onChange={setRadiusM} />}
      <View style={{ gap: 6 }}>
        <AppText variant="eyebrow">{i18n.t('contour.title')}</AppText>
        <AppText>{place.boundaryLine}</AppText>
        <View style={{ flexDirection: 'row' }}>
          <Chip
            size="sm"
            label={i18n.t('contour.open')}
            onPress={() => {
              onContour(place.id);
            }}
          />
        </View>
      </View>
      <Button
        label={i18n.t('common.save')}
        onPress={() => {
          onSave(place.id, { name, category, radiusM });
        }}
      />
      <Button
        label={i18n.t('place.card.delete')}
        tone="ghost"
        icon="trash"
        onPress={() => {
          onDelete(place.id);
        }}
      />
    </Sheet>
  );
}
