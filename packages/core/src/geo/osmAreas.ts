import { haversineDistanceM, isValidLatLon, type LatLon } from './haversine';
import { pointInRing, ringAreaM2, ringCentroid, tidyRing, type Ring } from './polygon';

/**
 * Parks and woods from the map (spike S8): turns the answer of the OpenStreetMap Overpass service
 * (`out geom`) into rings. Simple closed ways are taken as they are; big parks are usually
 * relations whose outer edge comes in several pieces, which are joined end to end.
 */

export interface MapArea {
  /** "way/123" or "relation/45": where it came from. */
  readonly source: string;
  readonly name: string | null;
  /** What the map calls it: park, forest, garden... */
  readonly kind: string;
  readonly ring: Ring;
  readonly areaM2: number;
}

interface RawGeometry {
  readonly lat?: unknown;
  readonly lon?: unknown;
}

interface RawElement {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly tags?: Record<string, unknown>;
  readonly geometry?: unknown;
  readonly members?: unknown;
}

const KIND_TAGS = ['leisure', 'landuse', 'natural'] as const;

function toPoints(raw: unknown): LatLon[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return (raw as RawGeometry[]).flatMap((p) => {
    const point = { lat: Number(p.lat), lon: Number(p.lon) };
    return typeof p.lat === 'number' && typeof p.lon === 'number' && isValidLatLon(point)
      ? [point]
      : [];
  });
}

const sameSpot = (a: LatLon, b: LatLon): boolean => haversineDistanceM(a, b) < 0.5;

/** Joins pieces of an edge end to end into closed rings; pieces that do not close are dropped. */
function joinPieces(pieces: readonly LatLon[][]): LatLon[][] {
  const left = pieces.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: LatLon[][] = [];
  while (left.length > 0) {
    let current = left.shift() ?? [];
    let grew = true;
    while (grew) {
      const head = current[0];
      const tail = current[current.length - 1];
      if (head !== undefined && tail !== undefined && current.length > 3 && sameSpot(head, tail)) {
        break;
      }
      grew = false;
      for (let i = 0; i < left.length; i += 1) {
        const piece = left[i];
        const pHead = piece?.[0];
        const pTail = piece?.[piece.length - 1];
        if (
          piece === undefined ||
          pHead === undefined ||
          pTail === undefined ||
          tail === undefined
        ) {
          continue;
        }
        if (sameSpot(tail, pHead)) {
          current = [...current, ...piece.slice(1)];
        } else if (sameSpot(tail, pTail)) {
          current = [...current, ...[...piece].reverse().slice(1)];
        } else {
          continue;
        }
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    const head = current[0];
    const tail = current[current.length - 1];
    if (head !== undefined && tail !== undefined && current.length > 3 && sameSpot(head, tail)) {
      rings.push(current.slice(0, -1));
    }
  }
  return rings;
}

function areaFrom(element: RawElement): MapArea | null {
  const tags = element.tags ?? {};
  const kind = KIND_TAGS.map((k) => tags[k]).find((v) => typeof v === 'string');
  if (typeof kind !== 'string') {
    return null;
  }
  let rings: LatLon[][] = [];
  if (element.type === 'way') {
    const points = toPoints(element.geometry);
    const head = points[0];
    const tail = points[points.length - 1];
    if (head !== undefined && tail !== undefined && points.length > 3 && sameSpot(head, tail)) {
      rings = [points.slice(0, -1)];
    }
  } else if (element.type === 'relation' && Array.isArray(element.members)) {
    const outer = (element.members as { role?: unknown; geometry?: unknown }[])
      .filter((m) => m.role === 'outer')
      .map((m) => toPoints(m.geometry));
    rings = joinPieces(outer);
  }
  let best: MapArea | null = null;
  for (const raw of rings) {
    let ring: LatLon[];
    try {
      ring = tidyRing(raw);
    } catch {
      continue;
    }
    const areaM2 = ringAreaM2(ring);
    if (best === null || areaM2 > best.areaM2) {
      best = {
        source: `${String(element.type)}/${String(element.id)}`,
        name: typeof tags['name'] === 'string' ? tags['name'] : null,
        kind,
        ring,
        areaM2,
      };
    }
  }
  return best;
}

/** The areas in an Overpass answer, the ones that contain `at` first, smallest first. */
export function parseOverpassAreas(answer: unknown, at: LatLon): MapArea[] {
  const elements = (answer as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  const areas = (elements as RawElement[]).flatMap((e) => {
    const area = areaFrom(e);
    return area === null ? [] : [area];
  });
  const rank = (a: MapArea): number => (pointInRing(at, a.ring) ? 0 : 1);
  return areas.sort((a, b) => rank(a) - rank(b) || a.areaM2 - b.areaM2);
}

/** The Overpass query for the parks and woods around a position (`radiusM` meters). */
export function overpassQuery(at: LatLon, radiusM = 150): string {
  const around = `(around:${String(radiusM)},${at.lat.toFixed(5)},${at.lon.toFixed(5)})`;
  const filters = [
    '["leisure"~"^(park|garden|nature_reserve|dog_park)$"]',
    '["landuse"~"^(forest|recreation_ground|village_green)$"]',
    '["natural"="wood"]',
  ];
  const parts = ['way', 'relation'].flatMap((type) => filters.map((f) => `${type}${around}${f};`));
  return `[out:json][timeout:20];(${parts.join('')});out geom;`;
}

/** The middle of an area, for showing it. */
export function areaCentre(area: MapArea): LatLon {
  return ringCentroid(area.ring);
}
