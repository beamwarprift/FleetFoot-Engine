// Colours of every theme, the one source for the popup, the options page and the overlay. Each
// pair of text and background reaches WCAG 2.2 AA contrast (checked by axe on every theme).

import type { ThemeName } from '../core/settings/Themes.ts';

export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly surface2: string;
  readonly border: string;
  readonly borderSoft: string;
  readonly text: string;
  readonly muted: string;
  /**
   * The descriptions of the options page: a warm grey, further from the text than `muted` and
   * from every accent, so what explains never draws the eye like what is set or chosen.
   */
  readonly help: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly danger: string;
  readonly focus: string;
  /** A light background: the browser's own controls follow it. */
  readonly light: boolean;
  /**
   * The logo's colours never change, so on a background where they would lose contrast it sits on
   * its own near-black plate (light and dimmed themes).
   */
  readonly logoPlate: boolean;
}

/** The near-black base the dark themes share; each one tints it and brings its accent. */
function dark(tint: Partial<Palette> & Pick<Palette, 'accent' | 'focus'>): Palette {
  return {
    bg: '#0b0a08',
    surface: '#15130f',
    surface2: '#201d17',
    border: '#3f392c',
    borderSoft: '#27231b',
    text: '#f2eee4',
    muted: '#bbb29b',
    help: '#b3b0a8',
    onAccent: '#0b0a08',
    danger: '#ff8a8a',
    light: false,
    logoPlate: false,
    ...tint,
  };
}

export const PALETTES: Readonly<Record<ThemeName, Palette>> = {
  yellow: dark({
    bg: '#0c0b07',
    surface: '#17150c',
    surface2: '#221f12',
    border: '#4a4224',
    borderSoft: '#2a2616',
    muted: '#bfb48c',
    help: '#b4b1a6',
    accent: '#ffd23f',
    focus: '#ffe680',
  }),
  cyan: dark({ accent: '#3fd0ff', focus: '#9be7ff' }),
  magenta: dark({ accent: '#ff5ccf', focus: '#ffa3e6' }),
  green: dark({ accent: '#45d483', focus: '#9ff0c0' }),
  violet: dark({ accent: '#a98bff', focus: '#d0c2ff' }),
  coral: dark({ accent: '#ff7a59', focus: '#ffb7a3' }),
  // Dimmed themes: a mid-dark background and softened text, so nothing glares.
  slate: dark({
    bg: '#1e2228',
    surface: '#262b33',
    surface2: '#2f353e',
    border: '#4a525d',
    borderSoft: '#343a43',
    text: '#c5ced8',
    muted: '#98a2ad',
    help: '#98a2ad',
    accent: '#8ab4d8',
    onAccent: '#1e2228',
    focus: '#b8d2ea',
    logoPlate: true,
  }),
  sepia: dark({
    bg: '#2a2119',
    surface: '#342a20',
    surface2: '#3e3328',
    border: '#5c4d3b',
    borderSoft: '#45392c',
    text: '#e0cfb2',
    muted: '#b8a587',
    help: '#aea18f',
    accent: '#d9a86c',
    onAccent: '#2a2119',
    focus: '#ecc699',
    logoPlate: true,
  }),
  sage: dark({
    bg: '#1c2520',
    surface: '#243029',
    surface2: '#2c3a32',
    border: '#4a5d50',
    borderSoft: '#33423a',
    text: '#cfdbd2',
    muted: '#9fb0a3',
    help: '#9fb0a3',
    accent: '#9cc7a4',
    onAccent: '#1c2520',
    focus: '#c3e0c8',
    logoPlate: true,
  }),
  light: {
    bg: '#f4f2ec',
    surface: '#ffffff',
    surface2: '#ece8de',
    border: '#bdb5a2',
    borderSoft: '#e0dbcf',
    text: '#1a1812',
    muted: '#5b5444',
    help: '#5b5444',
    accent: '#7a5a00',
    onAccent: '#ffffff',
    danger: '#b3261e',
    focus: '#7a5a00',
    light: true,
    logoPlate: true,
  },
};
