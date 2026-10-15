import type { WeatherFacts } from '@pawquest/weather';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { askForPlace, CACHE_MS, currentPlace, loadWeather } from './weatherService';

export type WeatherStatus = 'loading' | 'ok' | 'no-permission' | 'unavailable';

export interface WeatherState {
  readonly status: WeatherStatus;
  readonly facts: WeatherFacts | null;
  /** Ask for location (when it was missing) and reload. */
  readonly enable: () => void;
}

/**
 * Weather at the dog's position for the Today tab: loads on open, when the app returns to the
 * foreground and every half hour. A failure keeps the last answer and stays quiet (G-13).
 */
export function useWeather(): WeatherState {
  const [facts, setFacts] = useState<WeatherFacts | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('loading');
  const alive = useRef(true);
  const isAlive = (): boolean => alive.current;

  const refresh = useCallback(async (force: boolean): Promise<void> => {
    const place = await currentPlace();
    if (!isAlive()) {
      return;
    }
    if (place.kind === 'no-permission') {
      setStatus('no-permission');
      return;
    }
    if (place.kind === 'unknown') {
      setStatus((s) => (s === 'ok' ? s : 'unavailable'));
      return;
    }
    const loaded = await loadWeather(place.at, Date.now(), force);
    if (!isAlive()) {
      return;
    }
    if (loaded === null) {
      setStatus((s) => (s === 'ok' ? s : 'unavailable'));
    } else {
      setFacts(loaded);
      setStatus('ok');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh(false);
    const timer = setInterval(() => {
      void refresh(false);
    }, CACHE_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh(false);
      }
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const enable = useCallback(() => {
    void askForPlace().then((granted) => {
      if (granted) {
        setStatus('loading');
        void refresh(true);
      }
    });
  }, [refresh]);

  return { status, facts, enable };
}
