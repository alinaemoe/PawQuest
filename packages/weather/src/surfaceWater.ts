/**
 * How wet the ground still is, from the rain of the last days and how fast it dries. A bucket of
 * surface water in millimetres: rain fills it, the sun and wind (the model's reference
 * evapotranspiration) and the soaking away empty it. Autumn is the point of it: at 8 degrees under
 * a grey sky the same rain stays on the ground for days, in a hot June afternoon for hours, so
 * "no rain in the last day" does not mean dry.
 *
 * It is an estimate for open ground: shade, clay and asphalt dry differently, which is why the
 * result is told as dry / damp / wet and never as a number.
 */

/** How much of the reference evapotranspiration a wet surface gives off (open water: about all). */
export const EVAPORATION_FACTOR = 1;
/** The soaking away of standing water: it falls by one part in e every this many hours. */
export const DRAIN_HOURS = 96;
/** From this much surface water the ground is wet (puddles), from the lower one damp. */
export const WET_FROM_MM = 1.5;
export const DAMP_FROM_MM = 0.4;
/** From this much there are puddles all around, and from the higher one mud. */
export const PUDDLES_FROM_MM = 2.5;
export const MUD_FROM_MM = 6;

export interface HourlyWater {
  /** Rain that fell in the hour, mm. */
  readonly rainMm: number;
  /** Reference evapotranspiration of the hour, mm; null when the model gave none. */
  readonly et0Mm: number | null;
}

/** Evaporation of an hour with no value: a mild autumn day (about half a millimetre a day). */
export const FALLBACK_ET0_MM_PER_H = 0.02;

/** Runs the bucket over the hours in order (oldest first) and returns what is left, mm. */
export function surfaceWaterMm(hours: readonly HourlyWater[]): number {
  let water = 0;
  const keep = Math.exp(-1 / DRAIN_HOURS);
  for (const hour of hours) {
    water += Math.max(0, hour.rainMm);
    water *= keep;
    water = Math.max(
      0,
      water - EVAPORATION_FACTOR * Math.max(0, hour.et0Mm ?? FALLBACK_ET0_MM_PER_H),
    );
  }
  return Math.round(water * 100) / 100;
}
