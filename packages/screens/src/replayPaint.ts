import {
  median,
  simplifyTrack,
  speedZoneOf,
  type SpeedProfile,
  type SpeedZone,
} from '@pawquest/core';
import type { ReplayZone, WalkReplay } from '@pawquest/data';

/** The route of a replay painted by speed or by place (docs/23, step 3.19): segments with a colour, and a legend. */

export type PaintMode = 'plain' | 'speed' | 'places';
export type Scheme = 'light' | 'dark';

/** Speed zones from the quiet to the quick: grey, soft green, green, amber, red. */
const SPEED_PAINT: Readonly<Record<Scheme, Readonly<Record<SpeedZone, string>>>> = {
  light: {
    standing: '#aab6ae',
    slow: '#7fc4a9',
    walk: '#2f9e77',
    fast: '#e29a2d',
    run: '#d6493f',
  },
  dark: {
    standing: '#66756c',
    slow: '#6fbfa2',
    walk: '#43b98c',
    fast: '#f0b04a',
    run: '#ee6a60',
  },
};

/** Places get a colour each, in the order the walk met them; apart enough to tell on a small map. */
const PLACE_PAINT: Readonly<Record<Scheme, readonly string[]>> = {
  light: ['#2f7d5b', '#3b82c4', '#b8628b', '#c9852a', '#7a5bbf', '#2a9d9d', '#bf5a3c', '#6f8f2e'],
  dark: ['#5fc79a', '#6aa8e6', '#e08bb5', '#e8a850', '#a98bf0', '#52c7c7', '#e8805f', '#a3c85c'],
};

const OUTSIDE: Readonly<Record<Scheme, string>> = { light: '#9aa6a0', dark: '#6b7a72' };

export function speedColor(zone: SpeedZone, scheme: Scheme): string {
  return SPEED_PAINT[scheme][zone];
}

/** The colour of each place of a walk, by the order the places first appear in it. */
export function placeColors(zones: readonly ReplayZone[], scheme: Scheme): Map<string, string> {
  const palette = PLACE_PAINT[scheme];
  const out = new Map<string, string>();
  for (const z of [...zones].sort((a, b) => a.fromTs - b.fromTs)) {
    if (!out.has(z.placeId)) {
      out.set(z.placeId, palette[out.size % palette.length] ?? OUTSIDE[scheme]);
    }
  }
  return out;
}

export interface PaintSegment {
  readonly key: string;
  readonly color: string;
  /** [lon, lat] pairs; neighbours share their end point, so the line has no holes. */
  readonly coordinates: readonly (readonly [number, number])[];
  /** Seconds since the epoch at the start and at the end, to tell the walked part from the rest. */
  readonly t0: number;
  readonly t1: number;
}

export interface LegendItem {
  /** A speed zone, a place id, or "outside". */
  readonly key: string;
  readonly color: string;
  readonly seconds: number;
}

export interface RoutePaint {
  readonly segments: readonly PaintSegment[];
  readonly legend: readonly LegendItem[];
}

/** The innermost place at a moment: of the places around it the one that was held for the least time. */
function innermost(zones: readonly ReplayZone[], ts: number): ReplayZone | null {
  let best: ReplayZone | null = null;
  for (const z of zones) {
    if (
      ts >= z.fromTs &&
      ts <= z.toTs &&
      (best === null || z.toTs - z.fromTs < best.toTs - best.fromTs)
    ) {
      best = z;
    }
  }
  return best;
}

/** The speed zone around each point: the median speed within 15 s on either side (A-25 step 5), sweeping once. */
function speedZonesOf(
  points: readonly { readonly ts: number }[],
  profile: SpeedProfile | null,
): SpeedZone[] {
  if (profile === null) {
    return points.map(() => 'standing');
  }
  const intervals = profile.intervals;
  let from = 0;
  return points.map((p) => {
    while (from < intervals.length && (intervals[from]?.ts ?? 0) < p.ts - 15_000) {
      from += 1;
    }
    const near: number[] = [];
    for (let k = from; k < intervals.length && (intervals[k]?.ts ?? 0) <= p.ts + 15_000; k += 1) {
      near.push(intervals[k]?.mps ?? 0);
    }
    return speedZoneOf(near.length === 0 ? 0 : median(near));
  });
}

/**
 * The route cut into stretches of one colour. The track is thinned (3 m) but keeps every point
 * where the colour changes, so a stretch begins and ends where the pace or the place really did.
 * The legend adds up the real time of every key, so the shares are what happened, not what was drawn.
 */
export function routePaint(replay: WalkReplay, mode: PaintMode, scheme: Scheme): RoutePaint {
  if (mode === 'plain' || replay.points.length < 2) {
    return { segments: [], legend: [] };
  }
  const colors = placeColors(replay.zones, scheme);
  const zones = mode === 'speed' ? speedZonesOf(replay.points, replay.profile) : [];
  const keyAt = (i: number): { key: string; color: string } => {
    if (mode === 'speed') {
      const zone = zones[i] ?? 'standing';
      return { key: zone, color: speedColor(zone, scheme) };
    }
    const place = innermost(replay.zones, replay.points[i]?.ts ?? 0);
    return place === null
      ? { key: 'outside', color: OUTSIDE[scheme] }
      : { key: place.placeId, color: colors.get(place.placeId) ?? OUTSIDE[scheme] };
  };
  const keys = replay.points.map((_, i) => keyAt(i));

  const keep = new Set(simplifyTrack(replay.points, { epsilonM: 3 }));
  keys.forEach((k, i) => {
    if (i > 0 && keys[i - 1]?.key !== k.key) {
      keep.add(i - 1);
      keep.add(i);
    }
  });
  const kept = [...keep].sort((a, b) => a - b);
  const segments: PaintSegment[] = [];
  for (let n = 0; n + 1 < kept.length; n += 1) {
    const ia = kept[n] ?? 0;
    const ib = kept[n + 1] ?? 0;
    const a = replay.points[ia];
    const b = replay.points[ib];
    const k = keys[ia];
    if (a === undefined || b === undefined || k === undefined) {
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.key === k.key) {
      segments[segments.length - 1] = {
        ...last,
        coordinates: [...last.coordinates, [b.lon, b.lat]],
        t1: b.ts / 1000,
      };
    } else {
      segments.push({
        key: k.key,
        color: k.color,
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
        t0: a.ts / 1000,
        t1: b.ts / 1000,
      });
    }
  }

  const seconds = new Map<string, { color: string; seconds: number }>();
  for (let i = 0; i + 1 < replay.points.length; i += 1) {
    const a = replay.points[i];
    const b = replay.points[i + 1];
    const k = keys[i];
    if (a === undefined || b === undefined || k === undefined || b.ts - a.ts > 120_000) {
      continue; // a gap is not time spent anywhere in particular
    }
    const sum = seconds.get(k.key) ?? { color: k.color, seconds: 0 };
    sum.seconds += (b.ts - a.ts) / 1000;
    seconds.set(k.key, sum);
  }
  return {
    segments,
    legend: [...seconds.entries()]
      .map(([key, v]): LegendItem => ({ key, color: v.color, seconds: Math.round(v.seconds) }))
      .sort((a, b) => b.seconds - a.seconds),
  };
}
