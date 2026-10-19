import type { PlaceActivity } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { localDay, placeSummary, placeWeeks, type PlaceWalk } from '@pawquest/insights';
import { describe, expect, it } from 'vitest';

import { placeCards } from './placeStatsModel';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 9);
const today = localDay(NOW, 180);

const walks = (count: number, minutes: number): PlaceWalk[] =>
  Array.from({ length: count }, (_, i) => ({
    startedAt: NOW - i * DAY,
    tzOffsetMin: 180,
    durationS: minutes * 60,
    events: 1,
  }));
const activity = (name: string, list: PlaceWalk[]): PlaceActivity => ({
  placeId: name,
  name,
  category: 'park',
  summary: placeSummary(list),
  weeks: placeWeeks(list, today, 3),
  dwellS: 0,
  zoneEvents: 0,
  eventsPerHour: null,
});

describe('placeCards', () => {
  it('a place with enough walks: the count, the usual length, the last time, a bar per week', () => {
    const [card] = placeCards([activity('Парк', walks(6, 40))], today, NOW, ru);
    expect(card?.title).toBe('Парк');
    expect(card?.subtitle).toBe('6 прогулок · обычно 40 мин');
    expect(card?.footnote).toBe('Последний раз 16 окт');
    expect(card?.enough).toBe(true);
    expect(card?.bars).toHaveLength(3);
    expect(card?.bars[2]?.end).toBe(1);
    expect(card?.bars[2]?.value).toContain('40 мин');
    expect(card?.bars[0]?.value).toBe('—');
    expect(card?.bars[0]?.end).toBe(0);
  });

  it('few walks say how many are missing; a place with no name takes the name of its kind', () => {
    const cards = placeCards(
      [activity('Двор', walks(2, 20)), { ...activity('', walks(5, 30)), category: 'forest' }],
      today,
      NOW,
      ru,
    );
    expect(cards[0]?.footnote).toBe('Мало данных: нужно ещё 3 для картины');
    expect(cards[0]?.enough).toBe(false);
    expect(cards[1]?.title.length).toBeGreaterThan(0);
    expect(cards[1]?.title).not.toBe('');
  });

  it('the time inside the place and the rate of events: the rate only from an hour of it', () => {
    const [few] = placeCards([{ ...activity('Парк', walks(6, 40)), dwellS: 1500 }], today, NOW, ru);
    expect(few?.note).toBe('В зоне: 25 мин · для частоты нужен час в зоне');
    const [rate] = placeCards(
      [{ ...activity('Парк', walks(6, 40)), dwellS: 7200, zoneEvents: 3, eventsPerHour: 1.5 }],
      today,
      NOW,
      ru,
    );
    expect(rate?.note).toBe('В зоне: 2 ч 00 мин · событий в час: 1,5');
    const [none] = placeCards([activity('Парк', walks(6, 40))], today, NOW, ru);
    expect(none?.note).toBeNull();
  });

  it('a walk of unknown length is a walk with no usual length', () => {
    const list: PlaceWalk[] = [{ startedAt: NOW, tzOffsetMin: 180, durationS: null, events: 0 }];
    const [card] = placeCards([activity('Парк', list)], today, NOW, ru);
    expect(card?.subtitle).toBe('1 прогулка');
    expect(card?.bars[2]?.value).toBe('1 прогулка');
  });
});
