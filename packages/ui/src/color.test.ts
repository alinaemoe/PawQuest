import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { contrastRatio, luminance, mix, parseHex, toHex, withAlpha } from './color';

describe('parseHex / toHex', () => {
  it('parses long and short forms and is case-insensitive', () => {
    expect(parseHex('#2f7d5b')).toEqual({ r: 47, g: 125, b: 91 });
    expect(parseHex('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#0a0')).toEqual({ r: 0, g: 170, b: 0 });
  });

  it('formats lowercase and clamps and rounds channels', () => {
    expect(toHex({ r: 47, g: 125, b: 91 })).toBe('#2f7d5b');
    expect(toHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080');
  });

  it.each(['', '#12', '#12345', '#gggggg', 'red', '2f7d5b'])('rejects %j', (bad) => {
    expect(() => parseHex(bad)).toThrow(RangeError);
  });

  it('property: round-trips every color', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          expect(parseHex(toHex({ r, g, b }))).toEqual({ r, g, b });
        },
      ),
    );
  });
});

describe('mix (Oklab, like CSS color-mix)', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(mix('#2f7d5b', '#ffffff', 0)).toBe('#2f7d5b');
    expect(mix('#2f7d5b', '#ffffff', 1)).toBe('#ffffff');
  });

  it('matches the known CSS value for black and white 50% (rgb(99, 99, 99))', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#636363');
  });

  it('mixing a color with itself changes nothing', () => {
    expect(mix('#6fd0a0', '#6fd0a0', 0.37)).toBe('#6fd0a0');
  });

  it('rejects t outside [0, 1]', () => {
    expect(() => mix('#000', '#fff', -0.1)).toThrow(RangeError);
    expect(() => mix('#000', '#fff', 1.1)).toThrow(RangeError);
    expect(() => mix('#000', '#fff', Number.NaN)).toThrow(RangeError);
  });
});

describe('luminance and contrastRatio (WCAG)', () => {
  it('has luminance 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 12);
  });

  it('gives 21:1 for black on white and 1:1 for equal colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 9);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('matches the published ratio of #777 on white (4.48:1)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.478, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#2f7d5b', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#2f7d5b'),
      12,
    );
  });
});

describe('withAlpha', () => {
  it('formats an rgba string and validates alpha', () => {
    expect(withAlpha('#16201a', 0.13)).toBe('rgba(22, 32, 26, 0.13)');
    expect(() => withAlpha('#16201a', 1.5)).toThrow(RangeError);
  });
});
