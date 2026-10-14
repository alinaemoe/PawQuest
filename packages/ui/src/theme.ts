import { mix, withAlpha } from './color';

export type PaletteName = 'forest' | 'sea' | 'berry' | 'sun';
export type Scheme = 'light' | 'dark';

/** Accent colors per palette: one for the light scheme, one for the dark scheme (docs/10 §10.10). */
export const PALETTES: Readonly<
  Record<PaletteName, { readonly light: string; readonly dark: string }>
> = {
  forest: { light: '#2f7d5b', dark: '#6fd0a0' },
  sea: { light: '#1d6f8c', dark: '#6cc3dd' },
  berry: { light: '#92399b', dark: '#d79be0' },
  sun: { light: '#b0620a', dark: '#f0b25a' },
};

export const PALETTE_NAMES: readonly PaletteName[] = ['forest', 'sea', 'berry', 'sun'];

/** Colors of event types; they do not depend on the palette so map markers stay recognisable. */
export interface EventColors {
  readonly dog: string;
  readonly person: string;
  readonly child: string;
  readonly animal: string;
  readonly ok: string;
  readonly hard: string;
  readonly ex: string;
}

/** All event colors as a list (Object.values on an interface would be typed any[]). */
export function eventColorList(events: EventColors): string[] {
  return [
    events.dog,
    events.person,
    events.child,
    events.animal,
    events.ok,
    events.hard,
    events.ex,
  ];
}

export interface ThemeColors {
  readonly bg: string;
  readonly surface: string;
  readonly surface2: string;
  readonly ink: string;
  readonly muted: string;
  /** Hairline color as rgba (ink at 13% opacity). */
  readonly line: string;
  readonly accent: string;
  /** Text and icons on top of the accent color. */
  readonly accentInk: string;
  readonly accentSoft: string;
  readonly events: EventColors;
  readonly map: {
    readonly bg: string;
    readonly green: string;
    readonly water: string;
    readonly road: string;
  };
}

export interface Theme {
  readonly palette: PaletteName;
  readonly scheme: Scheme;
  readonly colors: ThemeColors;
}

const EVENTS: Readonly<Record<Scheme, EventColors>> = {
  light: {
    dog: '#d1701f',
    person: '#2f74c6',
    child: '#c0408f',
    animal: '#2f8a55',
    ok: '#b8860b',
    hard: '#c43d3d',
    ex: '#7452c8',
  },
  dark: {
    dog: '#f0974f',
    person: '#6ba6ec',
    child: '#ec86c4',
    animal: '#5cc58a',
    ok: '#e6b83c',
    hard: '#ee7a76',
    ex: '#a68cf0',
  },
};

/**
 * Builds the complete color set for a palette and scheme from the accent, following the CSS
 * tokens of the approved prototype (`color-mix(in oklab, ...)`), so web and app look the same.
 */
export function buildTheme(palette: PaletteName, scheme: Scheme): Theme {
  const accent = PALETTES[palette][scheme];
  const dark = scheme === 'dark';
  const surface = dark ? '#171c19' : '#ffffff';
  const ink = dark ? '#e8efea' : '#16201a';
  const surface2 = mix(dark ? '#1e2420' : '#f0f3ef', accent, dark ? 0.09 : 0.07);
  return {
    palette,
    scheme,
    colors: {
      bg: mix(dark ? '#0e1210' : '#f6f8f5', accent, dark ? 0.07 : 0.05),
      surface,
      surface2,
      ink,
      muted: dark ? '#9baba2' : '#5b6a61',
      line: withAlpha(ink, 0.13),
      accent,
      accentInk: dark ? '#0a1710' : '#ffffff',
      accentSoft: mix(surface, accent, 0.15),
      events: EVENTS[scheme],
      map: {
        bg: mix(surface2, accent, 0.07),
        green: mix(surface, accent, 0.24),
        water: mix(surface, '#4a90c8', dark ? 0.34 : 0.3),
        road: surface,
      },
    },
  };
}

/** Sizes shared by all screens (docs/03 G-01, prototype). */
export const metrics = {
  /** Spacing scale in dp. */
  space: [0, 4, 8, 12, 16, 20, 24, 32, 40] as const,
  radius: { chip: 999, button: 16, card: 18, event: 20, sheet: 26, phone: 38 } as const,
  /** Minimum touch target, and the larger one on the Active Walk screen (G-01). */
  touch: { min: 48, activeWalk: 72 } as const,
} as const;

export const fonts = {
  display: 'Unbounded',
  body: 'Onest',
  mono: 'JetBrains Mono',
} as const;
