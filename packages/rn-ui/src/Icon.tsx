import { SvgXml } from 'react-native-svg';

/** Inner SVG markup of the 24x24 line icons of the approved prototype. */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  chart: '<path d="M5 20v-6M12 20V5M19 20v-9"/>',
  paw: '<path d="M12 20c-3 0-5-1.8-5-3.8 0-2.4 3-5.2 5-5.2s5 2.8 5 5.2c0 2-2 3.8-5 3.8z"/><circle cx="5.5" cy="10" r="1.8"/><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="18.5" cy="10" r="1.8"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  tilde: '<path d="M4 13c3-6 5-6 8 0s5 6 8 0"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L12 17l-5.6 3.2 1.2-6.3L3 9.6l6.3-.8z"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  disc: '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><ellipse cx="12" cy="11.5" rx="5" ry="2"/>',
  cookie:
    '<circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 10h.01M10 15h.01M14.5 15h.01" stroke-width="3"/>',
  scale:
    '<path d="M5 5h14a2 2 0 012 2v12H3V7a2 2 0 012-2z"/><path d="M8 11a4 4 0 018 0l-2 2h-4z"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  bell: '<path d="M6 17v-6a6 6 0 0112 0v6l2 2H4z"/><path d="M10 21h4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" stroke-width="2.4"/>',
  minus: '<path d="M5 12h14"/>',
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  readonly name: IconName;
  readonly color: string;
  readonly size?: number;
  readonly strokeWidth?: number;
}

/** A 24x24 line icon drawn from the prototype's SVG markup. Decorative: hidden from screen readers. */
export function Icon({ name, color, size = 24, strokeWidth = 1.8 }: IconProps) {
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${String(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}
