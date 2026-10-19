import { refreshDerived, refreshMovingTimes } from '@pawquest/data';
import { useEffect } from 'react';

import { useApp } from './AppContext';

/** A few walks at a time, so that the screen is never held up by the counting. */
const CHUNK = 4;
const FIRST_DELAY_MS = 1500;
const NEXT_DELAY_MS = 60;

/**
 * Keeps the derived layer of the dog up to date in the background (docs/21): after the app has
 * drawn itself, and again whenever the data changed (a walk finished, a place named, weather or
 * an event added). Each step is a few walks; the next step waits a moment, so touches still win.
 * A failure never reaches the owner: the walk is marked and the rest goes on.
 */
export function useDerivedRefresh(): void {
  const { db, ctx, dog, version } = useApp();
  const dogId = dog?.id ?? null;
  useEffect(() => {
    if (dogId === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const step = (): void => {
      if (cancelled) {
        return;
      }
      try {
        // totals that a better rule changed are measured again first, a few walks at a time
        const movingLeft = refreshMovingTimes(db, ctx);
        const result = refreshDerived(db, ctx, dogId, { limit: CHUNK });
        if (result.remaining > 0 || movingLeft > 0) {
          timer = setTimeout(step, NEXT_DELAY_MS);
        }
      } catch {
        // the database itself failed (a closed connection on the way out): nothing to do here
      }
    };
    timer = setTimeout(step, FIRST_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [db, ctx, dogId, version]);
}
