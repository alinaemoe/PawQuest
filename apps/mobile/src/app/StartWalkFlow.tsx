import { placeAt, saveWeatherSnapshot, startWalk, topPlaces } from '@pawquest/data';
import { PreWalkSheet, weatherLine, type PreWalkChoice } from '@pawquest/screens';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { NewPlaceFlow } from './NewPlaceFlow';
import { useWeather } from './useWeather';
import { currentPlace } from './weatherService';
import { requestGpsPermission, startGpsUpdates } from './walkRecorder';

export interface StartWalkFlowProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** The walk is running. `keepAwake` is true when background recording was not allowed. */
  readonly onStarted: (keepAwake: boolean) => void;
}

/** Pre-walk sheet plus what happens behind "Start": permissions, the walk row, the GPS service. */
export function StartWalkFlow({ visible, onClose, onStarted }: StartWalkFlowProps) {
  const { db, ctx, dog, i18n, version, bump } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const weather = useWeather();
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // "Вы здесь: Парк у дома?": the saved place the dog is in right now
  useEffect(() => {
    if (!visible) {
      return;
    }
    let alive = true;
    setPicked(null);
    void currentPlace().then((result) => {
      if (alive) {
        const place = result.kind === 'ok' ? placeAt(db, result.at) : null;
        setSuggested(place === null ? null : { id: place.id, name: place.name });
      }
    });
    return () => {
      alive = false;
    };
  }, [visible, db]);

  const recentPlaces = useMemo(
    () => topPlaces(db, 4).map((p) => ({ id: p.id, name: p.name })),
    [db, version],
  );

  const lastPlaceKind = useMemo(() => {
    const row = db.all(
      `SELECT place_kind FROM walk WHERE place_kind IS NOT NULL AND deleted_at IS NULL
        ORDER BY started_at DESC LIMIT 1`,
    )[0];
    return typeof row?.['place_kind'] === 'string' ? row['place_kind'] : null;
  }, [db, version]);

  const start = async (choice: PreWalkChoice): Promise<void> => {
    if (dog === null) {
      return;
    }
    let keepAwake = false;
    if (choice.gps) {
      const permission = await requestGpsPermission();
      if (permission === 'denied') {
        // explain and let the owner switch GPS off and start again (spec S02-B)
        setNote(i18n.t('pre.denied'));
        return;
      }
      keepAwake = permission === 'foreground-only';
    }
    const walk = startWalk(db, ctx, {
      dogId: dog.id,
      mode: choice.gps ? 'gps' : 'no_gps',
      tzOffsetMin: -new Date().getTimezoneOffset(),
      placeKind: choice.placeKind,
      placeId: choice.placeId,
    });
    if (weather.facts !== null) {
      saveWeatherSnapshot(db, walk.id, weather.facts);
    }
    if (choice.gps) {
      await startGpsUpdates(i18n.t('active.notifTitle'), i18n.t('active.notifBody'));
    }
    setNote(keepAwake ? i18n.t('pre.foregroundOnly') : null);
    bump();
    onStarted(keepAwake);
  };

  return (
    <>
      <PreWalkSheet
        visible={visible}
        lastPlaceKind={lastPlaceKind}
        note={note}
        weatherLine={weather.facts === null ? null : weatherLine(weather.facts, i18n)}
        suggested={suggested}
        places={recentPlaces}
        pickedPlaceId={picked}
        onNewPlace={() => {
          setAdding(true);
        }}
        onClose={() => {
          setNote(null);
          onClose();
        }}
        onStart={(choice) => {
          void start(choice);
        }}
      />
      <NewPlaceFlow
        visible={adding}
        onClose={() => {
          setAdding(false);
        }}
        onDone={(id) => {
          setPicked(id);
          setAdding(false);
        }}
      />
    </>
  );
}
