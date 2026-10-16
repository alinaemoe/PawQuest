import {
  haversineDistanceM,
  ringAreaM2,
  tidyRing,
  type LatLon,
  type MapArea,
} from '@pawquest/core';
import type { I18n, MessageKey } from '@pawquest/i18n';

/** The editing of a contour: pure steps on a ring of vertices, so the map screen only draws them. */

/** Where a tap goes into the ring: on the edge nearest to it, or at the end of a short one. */
export function insertVertex(ring: readonly LatLon[], point: LatLon): LatLon[] {
  if (ring.length < 3) {
    return [...ring, point];
  }
  let bestEdge = 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    // detour through the point: how much longer the way gets when it goes through it
    const detour =
      haversineDistanceM(a, point) + haversineDistanceM(point, b) - haversineDistanceM(a, b);
    if (detour < best) {
      best = detour;
      bestEdge = i;
    }
  }
  return [...ring.slice(0, bestEdge + 1), point, ...ring.slice(bestEdge + 1)];
}

export function moveVertex(ring: readonly LatLon[], index: number, to: LatLon): LatLon[] {
  return ring.map((p, i) => (i === index ? to : p));
}

/** Removing a vertex of a triangle would leave no contour: the ring is kept then. */
export function removeVertex(ring: readonly LatLon[], index: number): LatLon[] {
  return ring.length <= 3 ? [...ring] : ring.filter((_, i) => i !== index);
}

export type RingProblem = 'few' | 'cross' | 'small' | 'invalid';

export interface RingState {
  readonly ok: boolean;
  readonly areaM2: number;
  readonly problem: RingProblem | null;
}

/** Whether the ring can be saved as a contour, and what is wrong when it cannot. */
export function ringState(ring: readonly LatLon[]): RingState {
  const areaM2 = ringAreaM2(ring);
  if (ring.length < 3) {
    return { ok: false, areaM2, problem: 'few' };
  }
  try {
    tidyRing(ring);
    return { ok: true, areaM2, problem: null };
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    const problem: RingProblem = text.includes('cross')
      ? 'cross'
      : text.includes('100 square')
        ? 'small'
        : text.includes('three')
          ? 'few'
          : 'invalid';
    return { ok: false, areaM2, problem };
  }
}

/** "33 га" for a park, "850 м²" for a yard. */
export function formatArea(areaM2: number, i18n: I18n): string {
  return areaM2 >= 10_000
    ? `${i18n.formatNumber(areaM2 / 10_000, areaM2 >= 100_000 ? 0 : 1)} ${i18n.t('unit.ha')}`
    : `${i18n.formatNumber(Math.round(areaM2 / 10) * 10)} ${i18n.t('unit.m2')}`;
}

const KIND_KEYS: Readonly<Record<string, MessageKey>> = {
  park: 'contour.kind.park',
  garden: 'contour.kind.garden',
  nature_reserve: 'contour.kind.reserve',
  dog_park: 'contour.kind.dogPark',
  forest: 'contour.kind.forest',
  wood: 'contour.kind.forest',
  recreation_ground: 'contour.kind.recreation',
  village_green: 'contour.kind.green',
};

/** "Парк 900-летия · 33 га": a candidate from the map as one line. */
export function candidateLine(area: MapArea, i18n: I18n): string {
  const key = KIND_KEYS[area.kind];
  const what = area.name ?? (key === undefined ? i18n.t('contour.kind.other') : i18n.t(key));
  return `${what} · ${formatArea(area.areaM2, i18n)}`;
}
