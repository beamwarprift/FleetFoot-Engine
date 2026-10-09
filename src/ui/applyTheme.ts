// Puts a theme on an extension page (popup, options) as CSS variables on its root.

import type { ThemeName } from '../core/settings/Themes.ts';
import { PALETTES, type Palette } from './themes.ts';

const VARIABLES: Readonly<Record<Exclude<keyof Palette, 'light' | 'logoPlate'>, string>> = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  border: '--border',
  borderSoft: '--border-soft',
  text: '--text',
  muted: '--muted',
  help: '--help',
  accent: '--accent',
  onAccent: '--on-accent',
  danger: '--danger',
  focus: '--focus',
};

/** Sets the theme on an extension page: CSS variables on the root, and the logo's plate. */
export function applyTheme(root: HTMLElement, theme: ThemeName): void {
  const palette = PALETTES[theme];
  for (const [key, variable] of Object.entries(VARIABLES)) {
    root.style.setProperty(variable, palette[key as keyof typeof VARIABLES]);
  }
  root.dataset['theme'] = theme;
  root.dataset['logoPlate'] = String(palette.logoPlate);
  root.style.setProperty('color-scheme', palette.light ? 'light' : 'dark');
}
