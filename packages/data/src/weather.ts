import type { WeatherFacts } from '@pawquest/weather';

import { toIso } from './ids';
import type { SqlDb } from './sql';

/** Stores the weather of a walk (one row per walk; a later save replaces the earlier one). */
export function saveWeatherSnapshot(db: SqlDb, walkId: string, facts: WeatherFacts): void {
  db.run(
    `INSERT OR REPLACE INTO weather_snapshot
       (walk_id, fetched_at, temp_c, apparent_c, precip_mm, wind_mps, humidity_pct, code, aqi, sunrise, sunset, facts_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      walkId,
      toIso(facts.at),
      facts.tempC,
      facts.apparentC,
      facts.rain3hMm,
      facts.windMs,
      facts.humidityPct,
      facts.code,
      facts.aqi,
      facts.sunrise === null ? null : toIso(facts.sunrise),
      facts.sunset === null ? null : toIso(facts.sunset),
      JSON.stringify(facts),
    ],
  );
}

/** The weather stored for a walk, or null when none was saved or the row is unreadable. */
export function getWeatherSnapshot(db: SqlDb, walkId: string): WeatherFacts | null {
  const row = db.all('SELECT facts_json FROM weather_snapshot WHERE walk_id = ?', [walkId])[0];
  const json = row?.['facts_json'];
  if (typeof json !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && 'tempC' in parsed
      ? (parsed as WeatherFacts)
      : null;
  } catch {
    return null;
  }
}
