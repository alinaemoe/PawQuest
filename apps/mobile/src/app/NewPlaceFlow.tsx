import { addAlias, createPlace, findSimilarPlaces, type PlaceCategory } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { categoryLabel, NewPlaceSheet } from '@pawquest/screens';
import { useEffect, useState } from 'react';

import { useApp } from './AppContext';
import { currentPlace } from './weatherService';

export interface NewPlaceFlowProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Where the place is, when it is not "here and now" (a place suggested from the walks). */
  readonly at?: { readonly lat: number; readonly lon: number };
  readonly initialCategory?: PlaceCategory;
  /** The id of the new place, or of the existing one the owner confirmed. */
  readonly onDone: (placeId: string) => void;
}

/**
 * "Новое место" (S14-A): saves a place where the owner stands now, after the duplicate check
 * (A-24): "Похоже на «Парк у дома». Это то же место?"
 */
export function NewPlaceFlow({ visible, onClose, at, initialCategory, onDone }: NewPlaceFlowProps) {
  const { db, ctx, i18n, bump } = useApp();
  const toast = useToast();
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (at !== undefined) {
      setPosition(at);
      return;
    }
    let alive = true;
    void currentPlace().then((result) => {
      if (alive) {
        setPosition(result.kind === 'ok' ? result.at : null);
      }
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  return (
    <NewPlaceSheet
      visible={visible}
      {...(initialCategory === undefined ? {} : { initialCategory })}
      hasPosition={position !== null}
      onClose={onClose}
      findSimilar={(name, category: PlaceCategory) => {
        const match = findSimilarPlaces(db, name, {
          category,
          ...(position === null ? {} : { point: position }),
        })[0];
        return match === undefined ? null : { id: match.place.id, name: match.place.name };
      }}
      onSave={({ category, name }) => {
        if (position === null) {
          return;
        }
        const place = createPlace(db, ctx, {
          category,
          name,
          label: categoryLabel(category, i18n),
          lat: position.lat,
          lon: position.lon,
        });
        bump();
        toast.show({ message: i18n.t('place.new.saved') });
        onDone(place.id);
      }}
      onUseExisting={(id, typed) => {
        addAlias(db, ctx, id, typed);
        bump();
        onDone(id);
      }}
    />
  );
}
