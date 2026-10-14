import {
  EARTH_RADIUS_M,
  findDuplicates,
  guessCategory,
  haversineDistanceM,
  nameKey,
  suggestPlaces,
  tidyName,
} from '@pawquest/core';
import { compareProportions, computeStreak, wilsonInterval } from '@pawquest/insights';

export interface SelfCheckItem {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

function check(name: string, run: () => string | null): SelfCheckItem {
  try {
    const failure = run();
    return { name, ok: failure === null, detail: failure ?? 'ok' };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Runs key functions of the domain packages inside the app's own JavaScript engine (Hermes).
 * Tests run in Node, which has APIs Hermes lacks, so this is the real compatibility check.
 */
export function runCoreSelfCheck(): SelfCheckItem[] {
  return [
    check('движок Hermes', () => ('HermesInternal' in globalThis ? null : 'это не Hermes')),
    check('юникод-регулярки', () =>
      /\p{L}+/u.test('парк') && !/\p{L}/u.test('123') ? null : 'нет \\p{L}',
    ),
    check('haversine', () => {
      const d = haversineDistanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
      return Math.abs(d - (EARTH_RADIUS_M * Math.PI) / 180) < 1e-6 ? null : `d=${String(d)}`;
    }),
    check('tidyName', () => {
      const t = tidyName('ПАРК   у дома!! 🌳');
      return t === 'Парк у дома' ? null : `«${t}»`;
    }),
    check('nameKey', () =>
      nameKey('Парк у дома') === nameKey('парк дома') ? null : 'ключи разные',
    ),
    check('guessCategory', () => {
      const ok =
        guessCategory('луг у дома') === 'meadow' &&
        guessCategory('Парковка') === null &&
        guessCategory('двор парка') === 'yard';
      return ok ? null : 'неверный тип места';
    }),
    check('findDuplicates', () => {
      const found = findDuplicates('парк дома', [{ id: 'a', nameNorm: nameKey('Парк у дома') }]);
      return found[0]?.id === 'a' ? null : 'дубликат не найден';
    }),
    check('suggestPlaces', () => {
      const stops = [0, 1, 2].map((i) => ({
        walkId: `w${String(i)}`,
        lat: 55 + i * 1e-5,
        lon: 37,
        durationS: 300,
      }));
      return suggestPlaces(stops, []).length === 1 ? null : 'место не предложено';
    }),
    check('wilsonInterval', () => {
      const w = wilsonInterval(7, 10);
      return w !== null && Math.abs(w.low - 0.3968) < 1e-3 ? null : 'неверный интервал';
    }),
    check('compareProportions', () => {
      const r = compareProportions({ successes: 7, n: 8 }, { successes: 2, n: 6 });
      return r !== null && Math.abs(r.p - 0.0909) < 1e-3 ? null : `p=${String(r?.p)}`;
    }),
    check('computeStreak', () => {
      const day = 20_000;
      const r = computeStreak([day - 2, day - 1, day], [], day);
      return r.current === 3 ? null : `current=${String(r.current)}`;
    }),
  ];
}
