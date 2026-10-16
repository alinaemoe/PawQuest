import { ringAreaM2, type LatLon, type MapArea } from '@pawquest/core';
import { getPlace, restorePlaceGeometry, setPlaceBoundary, type Place } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import {
  ContourCandidatesSheet,
  ContourChoiceSheet,
  candidateLine,
  formatArea,
} from '@pawquest/screens';
import { useState } from 'react';

import { useApp } from './AppContext';
import { fetchMapAreas } from './contour';
import { ContourEditor } from './ContourEditor';

export interface ContourFlowProps {
  readonly placeId: string;
  readonly onClose: () => void;
}

type Step =
  | { readonly kind: 'choice' }
  | { readonly kind: 'candidates'; readonly areas: readonly MapArea[] | 'loading' | 'offline' }
  | { readonly kind: 'editor'; readonly ring: readonly LatLon[]; readonly fromMap: MapArea | null };

/**
 * Giving a place its real boundary (spike S8): a choice of two (take it from the map, or draw),
 * the areas the map knows around the place, and the editor to check and adjust the outline.
 * Saving can be taken back from the toast.
 */
export function ContourFlow({ placeId, onClose }: ContourFlowProps) {
  const { db, ctx, i18n, bump } = useApp();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'choice' });
  const place = getPlace(db, placeId);
  if (place === null) {
    return null;
  }

  const save = (ring: readonly LatLon[], source: 'osm' | 'drawn', before: Place): void => {
    setPlaceBoundary(db, ctx, placeId, ring, source);
    bump();
    onClose();
    toast.show({
      message: i18n.t('contour.saved'),
      actionLabel: i18n.t('common.undo'),
      durationMs: 8000,
      onAction: () => {
        restorePlaceGeometry(db, ctx, before);
        bump();
      },
    });
  };

  const findOnMap = (): void => {
    setStep({ kind: 'candidates', areas: 'loading' });
    void fetchMapAreas({ lat: place.lat, lon: place.lon }).then((areas) => {
      setStep({ kind: 'candidates', areas: areas ?? 'offline' });
    });
  };

  const currentLine =
    place.boundary === null
      ? i18n.t('contour.noLine', { radius: i18n.formatDistance(place.radiusM) })
      : i18n.t('contour.line', { area: formatArea(ringAreaM2(place.boundary), i18n) });

  if (step.kind === 'editor') {
    const picked = step.fromMap;
    return (
      <ContourEditor
        centre={{ lat: place.lat, lon: place.lon }}
        radiusM={place.radiusM}
        initial={step.ring}
        onClose={onClose}
        onDone={(ring) => {
          // the outline of the map stays "from the map" while it is not changed by hand
          const same = picked !== null && JSON.stringify(ring) === JSON.stringify(picked.ring);
          save(ring, same ? 'osm' : 'drawn', place);
        }}
      />
    );
  }

  if (step.kind === 'candidates') {
    const { areas } = step;
    return (
      <ContourCandidatesSheet
        visible
        placeName={place.name}
        state={
          areas === 'loading' || areas === 'offline'
            ? areas
            : {
                candidates: areas.map((a) => ({ key: a.source, line: candidateLine(a, i18n) })),
              }
        }
        onPick={(key) => {
          const found = typeof areas === 'string' ? undefined : areas.find((a) => a.source === key);
          if (found !== undefined) {
            setStep({ kind: 'editor', ring: found.ring, fromMap: found });
          }
        }}
        onDraw={() => {
          setStep({ kind: 'editor', ring: place.boundary ?? [], fromMap: null });
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <ContourChoiceSheet
      visible
      placeName={place.name}
      currentLine={currentLine}
      hasContour={place.boundary !== null}
      onFromMap={findOnMap}
      onDraw={() => {
        setStep({ kind: 'editor', ring: place.boundary ?? [], fromMap: null });
      }}
      onRemove={() => {
        const before = place;
        setPlaceBoundary(db, ctx, placeId, null);
        bump();
        onClose();
        toast.show({
          message: i18n.t('contour.removed'),
          actionLabel: i18n.t('common.undo'),
          durationMs: 8000,
          onAction: () => {
            restorePlaceGeometry(db, ctx, before);
            bump();
          },
        });
      }}
      onClose={onClose}
    />
  );
}
