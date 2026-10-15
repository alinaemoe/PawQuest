import type { I18n } from '@pawquest/i18n';
import {
  aqiLevel,
  comfort,
  groundState,
  pollenLevel,
  puddles,
  rainAmount,
  surfaceHeat,
  topPollen,
  type GroundState,
  type Puddles,
  type WeatherFacts,
} from '@pawquest/weather';

export interface WeatherChip {
  readonly id: string;
  readonly text: string;
  /** `warn` for things worth a glance (wet, ice, hot ground, bad air); never a command (G-19). */
  readonly tone: 'plain' | 'warn';
}

export interface WeatherRow {
  readonly label: string;
  readonly value: string;
}

export interface WeatherView {
  readonly temp: string;
  readonly feels: string | null;
  readonly chips: readonly WeatherChip[];
  readonly rows: readonly WeatherRow[];
  /** Plain explanations shown under the rows (how to read the air index). */
  readonly notes: readonly string[];
  /** Says plainly that this is a model estimate for a nearby point. */
  readonly footnote: string;
  readonly updated: string;
}

function groundText(ground: GroundState, wet: Puddles, i18n: I18n): string {
  if (ground === 'wet' && wet !== 'none') {
    return i18n.t(wet === 'mud' ? 'weather.ground.wetMud' : 'weather.ground.wetPuddles');
  }
  return i18n.t(`weather.ground.${ground}`);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The facts of the moment as short chips for Today and a table for the detail sheet. */
export function weatherView(f: WeatherFacts, i18n: I18n, now: number = f.at): WeatherView {
  const deg = (n: number): string =>
    i18n.t('weather.temp', { t: i18n.formatNumber(Math.round(n)) });
  /** "приличный дождь (4,2 мм)": words first, the number for those who want it. */
  const amountText = (mmValue: number): string => {
    const amount = rainAmount(mmValue);
    const word = i18n.t(`weather.amount.${amount}`);
    return amount === 'none'
      ? word
      : i18n.t('weather.amountMm', { word, mm: i18n.formatNumber(mmValue, 1) });
  };
  const ms = (n: number): string => i18n.t('weather.detail.ms', { n: i18n.formatNumber(n, 1) });
  const ground = groundState(f);
  const heat = surfaceHeat(f);
  const feel = comfort(f);
  const air = aqiLevel(f.aqi);
  const wet = puddles(f);
  const lastRainAt = f.lastRainAt;
  const pollen = topPollen(f);

  const chips: WeatherChip[] = [
    {
      id: 'ground',
      text: groundText(ground, wet, i18n),
      tone: ground === 'wet' || ground === 'icy' || ground === 'snow' ? 'warn' : 'plain',
    },
  ];
  if (f.raining) {
    chips.push({ id: 'rain', text: i18n.t('weather.rainNow'), tone: 'plain' });
  } else if (f.nextRainMin !== null) {
    chips.push({
      id: 'rain',
      text: i18n.t('weather.rainIn', { min: f.nextRainMin }),
      tone: 'plain',
    });
  } else if (lastRainAt !== null && f.rain72hMm >= 0.5) {
    const amount = rainAmount(now - lastRainAt < 24 * 3_600_000 ? f.rain24hMm : f.rain72hMm);
    if (amount !== 'none') {
      chips.push({
        id: 'rain',
        text: i18n.t(`weather.rainWas.${amount}`, { ago: i18n.formatAgo(lastRainAt, now) }),
        tone: 'plain',
      });
    }
  }
  if (f.daylightLeftMin !== null) {
    chips.push({
      id: 'light',
      text: i18n.t('weather.light.left', { dur: i18n.formatDuration(f.daylightLeftMin * 60) }),
      tone: 'plain',
    });
  } else if (f.untilSunriseMin !== null) {
    chips.push({
      id: 'light',
      text: i18n.t('weather.light.dawn', { dur: i18n.formatDuration(f.untilSunriseMin * 60) }),
      tone: 'plain',
    });
  } else if (!f.isDay) {
    chips.push({ id: 'light', text: i18n.t('weather.light.dark'), tone: 'plain' });
  }
  if (heat !== 'ok') {
    chips.push({ id: 'heat', text: i18n.t(`weather.heat.${heat}`), tone: 'warn' });
  }
  if (feel !== 'ok') {
    chips.push({ id: 'comfort', text: i18n.t(`weather.comfort.${feel}`), tone: 'warn' });
  }
  if (air !== null && air !== 'good') {
    chips.push({
      id: 'air',
      text: i18n.t(`weather.aqi.${air}`, { n: i18n.formatNumber(Math.round(f.aqi ?? 0)) }),
      tone: air === 'fair' || air === 'moderate' ? 'plain' : 'warn',
    });
  }
  if (pollen !== null && pollen.level !== 'none') {
    chips.push({
      id: 'pollen',
      text: i18n.t('weather.pollen', { level: i18n.t(`weather.pollenLevel.${pollen.level}`) }),
      tone: 'plain',
    });
  }

  const rows: WeatherRow[] = [
    { label: i18n.t('weather.detail.ground'), value: groundText(ground, wet, i18n) },
    {
      label: i18n.t('weather.detail.lastRain'),
      value: f.raining
        ? i18n.t('weather.rainNow')
        : lastRainAt === null
          ? i18n.t('weather.detail.noRain')
          : i18n.formatAgo(lastRainAt, now),
    },
    { label: i18n.t('weather.detail.rain3'), value: amountText(f.rain3hMm) },
    { label: i18n.t('weather.detail.rain24'), value: amountText(f.rain24hMm) },
    { label: i18n.t('weather.detail.rain72'), value: amountText(f.rain72hMm) },
  ];
  const add = (label: string, value: string | null): void => {
    if (value !== null) {
      rows.push({ label, value });
    }
  };
  add(
    i18n.t('weather.detail.soil'),
    f.soilMoisture === null
      ? null
      : i18n.t('weather.detail.percent', {
          n: i18n.formatNumber(Math.round(f.soilMoisture * 100)),
        }),
  );
  add(i18n.t('weather.detail.surface'), f.surfaceTempC === null ? null : deg(f.surfaceTempC));
  if (f.windMs !== null) {
    add(
      i18n.t('weather.detail.wind'),
      f.gustMs === null
        ? ms(f.windMs)
        : i18n.t('weather.detail.windGust', { wind: ms(f.windMs), gust: ms(f.gustMs) }),
    );
  }
  add(i18n.t('weather.detail.uv'), f.uv === null ? null : i18n.formatNumber(round1(f.uv), 1));
  add(i18n.t('weather.detail.sunrise'), f.sunrise === null ? null : i18n.formatTime(f.sunrise));
  add(i18n.t('weather.detail.sunset'), f.sunset === null ? null : i18n.formatTime(f.sunset));
  add(
    i18n.t('weather.detail.aqi'),
    f.aqi === null || air === null
      ? null
      : `${i18n.formatNumber(Math.round(f.aqi))} — ${i18n.t(`weather.aqiWord.${air}`)}`,
  );
  add(i18n.t('weather.detail.pm25'), f.pm25 === null ? null : i18n.formatNumber(f.pm25, 1));
  add(
    i18n.t('weather.detail.pollen'),
    f.aqi === null && f.pm25 === null
      ? null
      : pollen === null
        ? i18n.t('weather.detail.none')
        : i18n.t(`weather.pollenLevel.${pollenLevel(pollen.grains)}` as 'weather.pollenLevel.low'),
  );

  return {
    temp: deg(f.tempC),
    feels:
      Math.abs(f.apparentC - f.tempC) >= 2
        ? i18n.t('weather.feels', { t: i18n.formatNumber(Math.round(f.apparentC)) })
        : null,
    chips,
    rows,
    notes: f.aqi === null ? [] : [i18n.t('weather.note.aqi')],
    footnote:
      f.gridDistanceKm >= 0.5
        ? i18n.t('weather.detail.grid', { km: i18n.formatNumber(f.gridDistanceKm, 1) })
        : i18n.t('weather.detail.gridNear'),
    updated: i18n.t('weather.detail.updated', { time: i18n.formatTime(f.at) }),
  };
}

/** One line for the pre-walk sheet: the temperature and the most telling chips. */
export function weatherLine(f: WeatherFacts, i18n: I18n): string {
  const view = weatherView(f, i18n);
  return [view.temp, ...view.chips.slice(0, 3).map((c) => c.text)].join(' · ');
}
