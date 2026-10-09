import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../../../src/core/settings/Settings.ts';
import { DEFAULT_THEME, THEME_NAMES } from '../../../src/core/settings/Themes.ts';
import { PALETTES } from '../../../src/ui/themes.ts';

describe('themes', () => {
  it('default to yellow on a near-black background', () => {
    expect(DEFAULT_THEME).toBe('yellow');
    expect(DEFAULT_SETTINGS.theme).toBe('yellow');
    expect(PALETTES.yellow.accent).toBe('#ffd23f');
    const background = Number.parseInt(PALETTES.yellow.bg.slice(1), 16);
    const channels = [background >> 16, (background >> 8) & 255, background & 255];
    expect(Math.max(...channels)).toBeLessThan(16);
  });

  it('have a palette for every name, and only known names are stored', () => {
    expect(Object.keys(PALETTES).sort()).toEqual([...THEME_NAMES].sort());
    expect(parseSettings({ theme: 'cyan' }).theme).toBe('cyan');
    expect(parseSettings({ theme: 'neon' }).theme).toBe('yellow');
  });

  it.each(THEME_NAMES)(
    '%s puts the logo on its plate wherever its fixed colours would fade',
    (theme) => {
      const palette = PALETTES[theme];
      // FLEETFOOT yellow and ENGINE red are the logo's own colours: they never change.
      const fades = ['#ffd23f', '#fe314b'].some(
        (colour) => contrastRatio(colour, palette.bg) < 4.5,
      );
      expect(palette.logoPlate).toBe(fades);
    },
  );

  it.each(['slate', 'sepia', 'sage'] as const)(
    '%s is dimmed: neither black nor light, text readable (AA) that does not glare',
    (theme) => {
      const palette = PALETTES[theme];
      // Clearly lighter than the near-black of the default, far from a light background.
      expect(luminance(palette.bg)).toBeGreaterThan(0.01);
      expect(luminance(palette.bg)).toBeLessThan(0.05);
      expect(palette.light).toBe(false);
      const contrast = contrastRatio(palette.text, palette.surface);
      expect(contrast).toBeGreaterThanOrEqual(7);
      expect(contrast).toBeLessThanOrEqual(11);
    },
  );

  it.each(THEME_NAMES)(
    '%s writes descriptions readable on every surface, quieter than the text',
    (theme) => {
      const palette = PALETTES[theme];
      for (const surface of [palette.bg, palette.surface, palette.surface2]) {
        expect(contrastRatio(palette.help, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.help, surface)).toBeLessThan(
          contrastRatio(palette.text, surface),
        );
      }
    },
  );

  it.each(THEME_NAMES)(
    '%s draws the on-off switch at 3:1 against what surrounds it (WCAG 1.4.11)',
    (theme) => {
      const palette = PALETTES[theme];
      // Off: a muted outline and knob on the section and on the track. On: the accent track, its knob.
      expect(contrastRatio(palette.muted, palette.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.muted, palette.surface2)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.accent, palette.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(3);
    },
  );
});

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
