import { describe, expect, it } from 'vitest';

import { contrastRatio, toHex } from './color';
import { darkenMapColor, darkenMapStyle, parseMapColor } from './mapStyle';
import positron from './fixtures/openfreemap-positron.json';

function hexOf(color: string): string {
  const rgba = parseMapColor(color);
  if (rgba === null) {
    throw new Error(`not a color: ${color}`);
  }
  return toHex({ r: Math.round(rgba.r), g: Math.round(rgba.g), b: Math.round(rgba.b) });
}

describe('parseMapColor', () => {
  it('reads every notation used by the OpenFreeMap style', () => {
    expect(parseMapColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseMapColor('#495e91')).toEqual({ r: 73, g: 94, b: 145, a: 1 });
    expect(parseMapColor('rgb(242,243,240)')).toEqual({ r: 242, g: 243, b: 240, a: 1 });
    expect(parseMapColor('rgb(230, 233, 229)')).toEqual({ r: 230, g: 233, b: 229, a: 1 });
    expect(parseMapColor('rgba(255, 255, 255, 0.7)')).toEqual({ r: 255, g: 255, b: 255, a: 0.7 });
  });

  it('converts hsl to rgb', () => {
    const grey = parseMapColor('hsl(0,0%,50%)');
    expect(grey?.r).toBeCloseTo(127.5, 5);
    const red = parseMapColor('hsl(0,100%,50%)');
    expect(red).toMatchObject({ r: 255, g: 0, b: 0 });
    const green = parseMapColor('hsl(120, 100%, 25%)');
    expect(green?.g).toBeCloseTo(127.5, 5);
    const blue = parseMapColor('hsl(240,100%,50%)');
    expect(blue?.b).toBeCloseTo(255, 5);
    expect(parseMapColor('hsla(0,0%,85%,0.69)')?.a).toBe(0.69);
    expect(parseMapColor('hsla(0,0%,85%,50%)')?.a).toBe(0.5);
  });

  it('returns null for anything that is not a color', () => {
    for (const text of ['linear', 'bold', '#12', '#ggg', 'rgb(1,2)', 'rgb(a,b,c)', 'blue', '']) {
      expect(parseMapColor(text)).toBeNull();
    }
  });
});

describe('darkenMapColor', () => {
  it('keeps the transparency and returns null for non-colors', () => {
    expect(darkenMapColor('hsla(0,0%,85%,0.53)', 'fill')).toMatch(/,0\.53\)$/);
    expect(darkenMapColor('linear', 'fill')).toBeNull();
  });

  it('makes light surfaces dark but keeps their order', () => {
    const lighter = hexOf(darkenMapColor('rgb(250,250,250)', 'fill') ?? '');
    const darker = hexOf(darkenMapColor('rgb(200,200,200)', 'fill') ?? '');
    expect(contrastRatio(lighter, '#000000')).toBeGreaterThan(contrastRatio(darker, '#000000'));
    expect(contrastRatio(lighter, '#000000')).toBeLessThan(3);
  });

  it('shades the dark map toward the original hue', () => {
    const water = parseMapColor(darkenMapColor('hsl(195,17%,78%)', 'fill') ?? '');
    expect(water !== null && water.b > water.r).toBe(true);
  });
});

describe('darkenMapStyle on the real OpenFreeMap positron style', () => {
  const dark = darkenMapStyle(positron);
  type Layer = (typeof positron.layers)[number];
  const byId = (style: { layers: readonly Layer[] }, id: string): Layer => {
    const found = style.layers.find((l) => l.id === id);
    if (found === undefined) {
      throw new Error(`no layer ${id}`);
    }
    return found;
  };

  it('does not mutate the input and keeps the structure', () => {
    expect(dark.layers).toHaveLength(positron.layers.length);
    expect(dark.layers.map((l) => l.id)).toEqual(positron.layers.map((l) => l.id));
    expect(dark.sources).toEqual(positron.sources);
    expect(byId(positron, 'background').paint).toEqual({ 'background-color': 'rgb(242,243,240)' });
  });

  it('turns the background dark', () => {
    const background = (byId(dark, 'background').paint as Record<string, string>)[
      'background-color'
    ];
    expect(contrastRatio(hexOf(background ?? ''), '#000000')).toBeLessThan(2);
  });

  it('leaves no light color behind anywhere in any paint property', () => {
    const light: string[] = [];
    const walk = (value: unknown, path: string, role: string): void => {
      if (typeof value === 'string') {
        const rgba = parseMapColor(value);
        if (rgba !== null && role === 'fill') {
          const luma = 0.2126 * rgba.r + 0.7152 * rgba.g + 0.0722 * rgba.b;
          if (luma > 110) {
            light.push(`${path}=${value}`);
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => {
          walk(v, `${path}[${String(i)}]`, role);
        });
      }
    };
    for (const layer of dark.layers) {
      for (const [property, value] of Object.entries(
        (layer as { paint?: Record<string, unknown> }).paint ?? {},
      )) {
        if (
          property.endsWith('-color') &&
          !property.includes('text') &&
          !property.includes('icon')
        ) {
          walk(value, `${layer.id}.${property}`, 'fill');
        }
      }
    }
    expect(light).toEqual([]);
  });

  it('labels stay readable: every text color has contrast >= 4.5 with the dark background', () => {
    const background = hexOf(
      (byId(dark, 'background').paint as Record<string, string>)['background-color'] ?? '',
    );
    const labels = dark.layers.filter(
      (l) => (l as { paint?: Record<string, unknown> }).paint?.['text-color'] !== undefined,
    );
    expect(labels.length).toBeGreaterThan(5);
    for (const layer of labels) {
      const color = (layer as { paint: Record<string, string> }).paint['text-color'];
      expect(contrastRatio(hexOf(color ?? ''), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text halos become dark so they do not glow on the dark map', () => {
    const halos = dark.layers
      .map((l) => (l as { paint?: Record<string, string> }).paint?.['text-halo-color'])
      .filter((c): c is string => c !== undefined);
    expect(halos.length).toBeGreaterThan(0);
    for (const halo of halos) {
      expect(contrastRatio(hexOf(halo), '#000000')).toBeLessThan(2);
    }
  });

  it('does not touch non-color properties such as opacity expressions and line widths', () => {
    const before = positron.layers.map((l) =>
      JSON.stringify((l as { paint?: Record<string, unknown> }).paint, (k, v: unknown) =>
        k.endsWith('-color') ? undefined : v,
      ),
    );
    const after = dark.layers.map((l) =>
      JSON.stringify((l as { paint?: Record<string, unknown> }).paint, (k, v: unknown) =>
        k.endsWith('-color') ? undefined : v,
      ),
    );
    expect(after).toEqual(before);
  });
});
