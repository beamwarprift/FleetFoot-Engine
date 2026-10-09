// The overlay's look, applied through CSSOM properties only: a page's CSP blocks style elements
// and style attributes in markup, never properties set from script (CSP Level 3), and no
// stylesheet has to cross into the page from the extension's isolated world.

import type { ThemeName } from '../../core/settings/Themes.ts';
import { PALETTES } from '../../ui/themes.ts';

export type Style = Readonly<Record<string, string>>;

export function applyStyle(element: HTMLElement, style: Style): void {
  for (const [property, value] of Object.entries(style)) {
    element.style.setProperty(property, value, 'important');
  }
}

export interface Palette {
  readonly surface: string;
  readonly text: string;
  readonly accent: string;
  readonly border: string;
  readonly focus: string;
}

/** Slightly translucent, so the player shows through at the edges. Chosen value. */
const SURFACE_ALPHA = 0.94;

function translucent(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${SURFACE_ALPHA})`;
}

/** The overlay in the user's theme: the same colours as the popup and the options page. */
export function themePalette(theme: ThemeName): Palette {
  const palette = PALETTES[theme];
  return {
    surface: translucent(palette.surface),
    text: palette.text,
    accent: palette.accent,
    border: palette.border,
    focus: palette.focus,
  };
}

/** Windows high contrast and similar modes: the system's colors, nothing of ours. */
export const FORCED_COLORS: Palette = {
  surface: 'Canvas',
  text: 'CanvasText',
  accent: 'Highlight',
  border: 'CanvasText',
  focus: 'Highlight',
};

/** The host in the page: out of the layout, above the page, no inherited page styles. */
export const HOST: Style = {
  all: 'initial',
  position: 'fixed',
  left: '0px',
  top: '0px',
  'z-index': '2147483647',
  'pointer-events': 'none',
  contain: 'layout style',
};

export function bar(palette: Palette): Style {
  return {
    display: 'flex',
    'align-items': 'center',
    gap: '2px',
    padding: '3px',
    margin: '0',
    'border-radius': '8px',
    border: `1px solid ${palette.border}`,
    background: palette.surface,
    color: palette.text,
    'font-family': 'system-ui, sans-serif',
    'font-size': '13px',
    // Room for tall scripts and digits of every language.
    'line-height': '1.25',
    'pointer-events': 'auto',
    'user-select': 'none',
    'box-sizing': 'border-box',
  };
}

/** Smallest control: 24 px (WCAG 2.5.8) for a mouse, 44 px for a finger (WCAG 2.5.5). */
const TARGET_PX = { fine: 24, coarse: 44 } as const;

export function button(palette: Palette, coarse = false): Style {
  const size = `${coarse ? TARGET_PX.coarse : TARGET_PX.fine}px`;
  return {
    'min-width': size,
    'min-height': size,
    padding: '0 6px',
    margin: '0',
    border: '0',
    'border-radius': '5px',
    background: 'transparent',
    color: palette.text,
    font: 'inherit',
    cursor: 'pointer',
    outline: 'none',
  };
}

export function rateText(palette: Palette): Style {
  return {
    'min-width': '48px',
    'text-align': 'center',
    color: palette.accent,
    'font-weight': '700',
    'font-variant-numeric': 'tabular-nums',
    // A speed reads left to right in every language («1.75×»).
    direction: 'ltr',
    'unicode-bidi': 'isolate',
  };
}

export function focusRing(palette: Palette): Style {
  return { outline: `2px solid ${palette.focus}`, 'outline-offset': '1px' };
}

export const NO_FOCUS_RING: Style = { outline: 'none' };
