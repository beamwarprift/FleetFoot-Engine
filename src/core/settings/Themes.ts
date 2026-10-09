// The colour themes a user can pick (several styles, some restful
// for the eyes, yellow on a near-black background as the default; the logo never changes). The colours live in src/ui/themes.ts.

export const THEME_NAMES = [
  'yellow',
  'cyan',
  'magenta',
  'green',
  'violet',
  'coral',
  // Dimmed, easy on the eyes: neither black nor light, text that does not glare (WCAG 2.2 AA).
  'slate',
  'sepia',
  'sage',
  'light',
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = 'yellow';
