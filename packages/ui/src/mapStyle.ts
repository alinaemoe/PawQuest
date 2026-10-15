// OpenFreeMap ships light styles only. The dark map is the light "positron" style with every paint
// color recolored here, so the app needs no second style service (spec 10.5: dark theme needs its
// own style, spike S2).

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const FUNCTION_COLOR = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }
  return [h, s, l];
}

/** Parses the color notations OpenFreeMap styles use: #rgb, #rrggbb, rgb[a](), hsl[a](). */
export function parseMapColor(text: string): Rgba | null {
  const value = text.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.length === 6 ? hex : null;
    if (full === null || !/^[0-9a-fA-F]{6}$/.test(full)) {
      return null;
    }
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const match = FUNCTION_COLOR.exec(value);
  if (match === null) {
    return null;
  }
  const kind = (match[1] ?? '').toLowerCase();
  const parts = (match[2] ?? '').split(/[\s,/]+/).filter((p) => p !== '');
  const nums = parts.map((p) => Number.parseFloat(p));
  if ((nums.length !== 3 && nums.length !== 4) || nums.some((n) => Number.isNaN(n))) {
    return null;
  }
  const alpha =
    nums.length === 4
      ? clamp01(parts[3]?.endsWith('%') ? (nums[3] ?? 1) / 100 : (nums[3] ?? 1))
      : 1;
  const [n0 = 0, n1 = 0, n2 = 0] = nums;
  if (kind.startsWith('rgb')) {
    return { r: n0, g: n1, b: n2, a: alpha };
  }
  const [r, g, b] = hslToRgb(((n0 % 360) + 360) % 360, clamp01(n1 / 100), clamp01(n2 / 100));
  return { r, g, b, a: alpha };
}

export type MapPaintRole = 'fill' | 'text' | 'halo';

/** Dark-theme color for one paint value. Light surfaces become dark but keep their order. */
export function darkenMapColor(text: string, role: MapPaintRole): string | null {
  const rgba = parseMapColor(text);
  if (rgba === null) {
    return null;
  }
  const [h, s, l] = rgbToHsl(rgba.r, rgba.g, rgba.b);
  let nextL: number;
  if (role === 'text') {
    nextL = 0.8;
  } else if (role === 'halo') {
    nextL = 0.1;
  } else {
    nextL = 0.05 + 0.15 * l ** 3;
  }
  const [r, g, b] = hslToRgb(h, role === 'fill' ? s * 0.8 : s * 0.3, nextL);
  return `rgba(${String(Math.round(r))},${String(Math.round(g))},${String(Math.round(b))},${String(Number(rgba.a.toFixed(3)))})`;
}

function roleOf(property: string): MapPaintRole {
  if (property === 'text-color' || property === 'icon-color') {
    return 'text';
  }
  if (property === 'text-halo-color' || property === 'icon-halo-color') {
    return 'halo';
  }
  return 'fill';
}

function recolor(value: unknown, role: MapPaintRole): unknown {
  if (typeof value === 'string') {
    return darkenMapColor(value, role) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => recolor(item, role));
  }
  return value;
}

interface StyleLayerLike {
  readonly paint?: Record<string, unknown>;
}

/** Returns a copy of a MapLibre style with every color property of every layer darkened. */
export function darkenMapStyle<T extends { readonly layers: readonly StyleLayerLike[] }>(
  style: T,
): T {
  const layers = style.layers.map((layer) => {
    if (layer.paint === undefined) {
      return layer;
    }
    const paint = Object.fromEntries(
      Object.entries(layer.paint).map(([property, value]) => [
        property,
        property.endsWith('-color') ? recolor(value, roleOf(property)) : value,
      ]),
    );
    return { ...layer, paint };
  });
  return { ...style, layers };
}
