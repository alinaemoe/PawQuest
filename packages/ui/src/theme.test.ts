import { describe, expect, it } from 'vitest';

import { contrastRatio, parseHex } from './color';
import { PALETTE_NAMES, PALETTES, buildTheme, eventColorList, metrics, type Scheme } from './theme';

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const COMBOS = PALETTE_NAMES.flatMap((palette) =>
  SCHEMES.map((scheme) => [palette, scheme] as const),
);

describe('buildTheme', () => {
  it('has the four palettes of the prototype', () => {
    expect(PALETTE_NAMES).toEqual(['forest', 'sea', 'berry', 'sun']);
    expect(PALETTES.forest).toEqual({ light: '#2f7d5b', dark: '#6fd0a0' });
  });

  it('uses the accent of the chosen palette and scheme', () => {
    expect(buildTheme('sea', 'light').colors.accent).toBe('#1d6f8c');
    expect(buildTheme('sea', 'dark').colors.accent).toBe('#6cc3dd');
  });

  it('returns valid hex colors for every token', () => {
    for (const [palette, scheme] of COMBOS) {
      const c = buildTheme(palette, scheme).colors;
      for (const hex of [
        c.bg,
        c.surface,
        c.surface2,
        c.ink,
        c.muted,
        c.accent,
        c.accentInk,
        c.accentSoft,
        c.map.bg,
        c.map.green,
        c.map.water,
        c.map.road,
        ...eventColorList(c.events),
      ]) {
        expect(() => parseHex(hex)).not.toThrow();
      }
      expect(c.line).toMatch(/^rgba\(\d+, \d+, \d+, 0\.13\)$/);
    }
  });

  it('keeps event colors independent of the palette (map markers stay recognisable)', () => {
    expect(buildTheme('forest', 'light').colors.events).toEqual(
      buildTheme('berry', 'light').colors.events,
    );
  });

  it('tints the background with the accent: different palettes give different backgrounds', () => {
    expect(buildTheme('forest', 'light').colors.bg).not.toBe(
      buildTheme('berry', 'light').colors.bg,
    );
  });
});

describe('contrast (WCAG 2.2 AA) in every palette and scheme', () => {
  it.each(COMBOS)('%s %s: body text on every surface is at least 4.5:1', (palette, scheme) => {
    const c = buildTheme(palette, scheme).colors;
    for (const surface of [c.bg, c.surface, c.surface2, c.accentSoft]) {
      expect(contrastRatio(c.ink, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(COMBOS)(
    '%s %s: secondary text is at least 4.5:1 on bg, surface and surface2',
    (palette, scheme) => {
      const c = buildTheme(palette, scheme).colors;
      for (const surface of [c.bg, c.surface, c.surface2]) {
        expect(contrastRatio(c.muted, surface)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(COMBOS)('%s %s: text on the accent color is at least 4.5:1', (palette, scheme) => {
    const c = buildTheme(palette, scheme).colors;
    expect(contrastRatio(c.accentInk, c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBOS)(
    '%s %s: accent and event colors are at least 3:1 on the surface (graphics)',
    (palette, scheme) => {
      const c = buildTheme(palette, scheme).colors;
      expect(contrastRatio(c.accent, c.surface)).toBeGreaterThanOrEqual(3);
      for (const color of eventColorList(c.events)) {
        expect(contrastRatio(color, c.surface)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe('metrics', () => {
  it('follows the spec touch target sizes (G-01)', () => {
    expect(metrics.touch).toEqual({ min: 48, activeWalk: 72 });
  });
});
