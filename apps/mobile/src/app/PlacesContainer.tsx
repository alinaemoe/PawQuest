import {
  getPlace,
  listPlaces,
  mergePlaces,
  similarPlacePairs,
  softDelete,
  undoMerge,
  updatePlace,
} from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { PlaceSheet, PlacesScreen, placeRow, tidyPair } from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { ContourFlow } from './ContourFlow';
import { NewPlaceFlow } from './NewPlaceFlow';

export interface PlacesContainerProps {
  readonly onBack: () => void;
}

/** Dog -> Places (S14): the library, tidy-up merges with "Отменить", and the place card. */
export function PlacesContainer({ onBack }: PlacesContainerProps) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // the place whose outline is being set (the card closes while the map flow is open)
  const [contourFor, setContourFor] = useState<string | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    const places = listPlaces(db);
    return {
      rows: places.map((p) => placeRow(p, i18n, now)),
      tidy: similarPlacePairs(db).map((pair) => tidyPair(pair, i18n)),
    };
  }, [db, i18n, version]);

  const open = openId === null ? null : (data.rows.find((r) => r.id === openId) ?? null);

  const merge = (keepId: string, otherId: string): void => {
    const record = mergePlaces(db, ctx, otherId, keepId);
    bump();
    toast.show({
      message: i18n.t('places.merged'),
      actionLabel: i18n.t('common.undo'),
      durationMs: 8000,
      onAction: () => {
        undoMerge(db, ctx, otherId, keepId, record);
        bump();
      },
    });
  };

  return (
    <>
      <PlacesScreen
        rows={data.rows}
        tidy={data.tidy}
        onBack={onBack}
        onOpen={setOpenId}
        onAdd={() => {
          setAdding(true);
        }}
        onMerge={merge}
      />
      <PlaceSheet
        place={contourFor === null ? open : null}
        onContour={setContourFor}
        onClose={() => {
          setOpenId(null);
        }}
        onSave={(id, patch) => {
          if (getPlace(db, id) !== null) {
            updatePlace(db, ctx, id, patch);
            bump();
            toast.show({ message: i18n.t('place.card.saved') });
          }
          setOpenId(null);
        }}
        onDelete={(id) => {
          softDelete(db, ctx, 'place', id);
          setOpenId(null);
          bump();
          toast.show({ message: i18n.t('place.card.deleted') });
        }}
      />
      {contourFor === null ? null : (
        <ContourFlow
          placeId={contourFor}
          onClose={() => {
            setContourFor(null);
          }}
        />
      )}
      <NewPlaceFlow
        visible={adding}
        onClose={() => {
          setAdding(false);
        }}
        onDone={() => {
          setAdding(false);
        }}
      />
    </>
  );
}
