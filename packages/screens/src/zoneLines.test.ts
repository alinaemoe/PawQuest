import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { zoneLines } from './chronologyRows';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const T0 = Date.UTC(2026, 9, 19, 7, 41, 0); // 10:41 in Minsk

describe('zoneLines', () => {
  it('a line per stay: the place, how long, from when to when, and the events that fell in it', () => {
    const lines = zoneLines(
      [
        { name: 'Парк', fromTs: T0, toTs: T0 + 38 * 60_000, dwellS: 38 * 60 },
        { name: 'Двор', fromTs: T0 + 40 * 60_000, toTs: T0 + 50 * 60_000, dwellS: 600 },
      ],
      [T0 + 5 * 60_000, T0 + 6 * 60_000, T0 + 45 * 60_000, T0 + 90 * 60_000],
      ru,
    );
    expect(lines).toEqual([
      'Парк · 38 мин · 10:41–11:19 · событий: 2',
      'Двор · 10 мин · 11:21–11:31 · событий: 1',
    ]);
  });

  it('a stay with no events has no count; no stays, no lines', () => {
    expect(
      zoneLines([{ name: 'Парк', fromTs: T0, toTs: T0 + 600_000, dwellS: 600 }], [], ru),
    ).toEqual(['Парк · 10 мин · 10:41–10:51']);
    expect(zoneLines([], [T0], ru)).toEqual([]);
  });
});
