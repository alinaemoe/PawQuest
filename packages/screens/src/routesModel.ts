import { median } from '@pawquest/core';

/** The numbers about a route that its passes give (G-19: counts and spread, no verdicts). */
export interface PassLike {
  readonly direction: 'forward' | 'backward';
  /** Time on foot on the way, without stops, in seconds. */
  readonly walkingS: number;
  readonly stops: number;
}

export interface RouteStats {
  readonly count: number;
  readonly medianS: number | null;
  readonly minS: number | null;
  readonly maxS: number | null;
  readonly forward: number;
  readonly backward: number;
  readonly withStops: number;
  /** Fewer than five passes: said so on the screen. */
  readonly fewData: boolean;
}

/** Fewer passes than this are labelled "мало данных" (06, 6.7). */
export const ENOUGH_PASSES = 5;

export function routeStats(passes: readonly PassLike[]): RouteStats {
  const times = passes.map((p) => p.walkingS);
  return {
    count: passes.length,
    medianS: times.length === 0 ? null : median(times),
    minS: times.length === 0 ? null : Math.min(...times),
    maxS: times.length === 0 ? null : Math.max(...times),
    forward: passes.filter((p) => p.direction === 'forward').length,
    backward: passes.filter((p) => p.direction === 'backward').length,
    withStops: passes.filter((p) => p.stops > 0).length,
    fewData: passes.length < ENOUGH_PASSES,
  };
}

export interface Versus {
  readonly kind: 'longer' | 'shorter' | 'usual';
  /** How much the pass differs from the usual one, in whole minutes (0 for "usual"). */
  readonly minutes: number;
}

/** A pass is "usual" within the larger of two minutes and a tenth of the usual time. */
const USUAL_FLOOR_S = 120;
const USUAL_SHARE = 0.1;
/** The usual time is only told from at least this many other passes. */
const MIN_OTHERS = 3;

/** How a pass compares with the other passes of the route: a fact, not a grade. */
export function versusUsual(pass: PassLike, others: readonly PassLike[]): Versus | null {
  // a pass with a stop is compared with passes that also had one, and the other way round
  const alike = others.filter((o) => o.stops > 0 === pass.stops > 0);
  if (alike.length < MIN_OTHERS) {
    return null;
  }
  const usual = median(alike.map((o) => o.walkingS));
  const diff = pass.walkingS - usual;
  if (Math.abs(diff) <= Math.max(USUAL_FLOOR_S, usual * USUAL_SHARE)) {
    return { kind: 'usual', minutes: 0 };
  }
  return { kind: diff > 0 ? 'longer' : 'shorter', minutes: Math.round(Math.abs(diff) / 60) };
}

/** "Дом → Магазин", "Круг от Дом", or null when the ends have no names. */
export function suggestedRouteName(
  loop: boolean,
  startName: string | null,
  endName: string | null,
  loopWord: string,
): string | null {
  if (loop) {
    return startName === null ? null : `${loopWord} ${startName}`;
  }
  return startName !== null && endName !== null ? `${startName} → ${endName}` : null;
}
