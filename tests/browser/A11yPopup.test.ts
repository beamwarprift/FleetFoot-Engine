// WCAG 2.2 AA, checked by axe-core on the popup as styled for real, with and without media, and
// with the loop help and the player list open in every theme.

import axe from 'axe-core';
import { afterEach, expect, it } from 'vitest';
import '../../entrypoints/popup/style.css';
import { createMediaEngine } from '../../src/core/MediaEngine.ts';
import { THEME_NAMES, type ThemeName } from '../../src/core/settings/Themes.ts';
import { startPopup } from '../../src/ui/popup/Popup.ts';
import { loaded, mountMedia, resetPage } from './media.ts';
import {
  ENGLISH,
  localClient,
  memoryProfiles,
  memorySettings,
  memoryStats,
  STORE_REVIEW_URL,
  settled,
  WCAG_22_AA,
} from './ui.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

async function violations(
  withMedia: boolean,
  theme: ThemeName = 'yellow',
  helpOpen = false,
  listOpen = false,
  open: string | null = null,
): Promise<string[]> {
  document.documentElement.lang = 'en';
  document.title = 'FleetFoot Engine';
  if (withMedia) await loaded(mountMedia({ width: 1, height: 1 }));
  const engine = createMediaEngine(window);
  cleanups.push(() => engine.stop());
  const popup = await startPopup({
    document,
    l10n: ENGLISH,
    settings: memorySettings({ theme }),
    profiles: memoryProfiles(),
    connect: async () => localClient(engine),
    copy: async () => true,
    openOptions: () => {},
    reviewUrl: STORE_REVIEW_URL,
    stats: memoryStats(5400),
    mount: (root) => document.body.append(root),
  });
  cleanups.push(() => popup.close());
  await settled();
  if (helpOpen) popup.view.root.querySelector<HTMLElement>('#loop-help')?.showPopover();
  if (listOpen) popup.view.root.querySelector<HTMLElement>('#player-list')?.showPopover();
  if (open !== null) popup.view.root.querySelector<HTMLElement>(open)?.showPopover();
  await settled();
  const result = await axe.run(popup.view.root, { runOnly: { type: 'tag', values: WCAG_22_AA } });
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

it('the popup with a player meets WCAG 2.2 AA', async () => {
  expect(await violations(true)).toEqual([]);
});

it('the popup without media meets WCAG 2.2 AA', async () => {
  expect(await violations(false)).toEqual([]);
});

it.each(THEME_NAMES)(
  'the popup in the %s theme, loop help open, meets WCAG 2.2 AA',
  async (theme) => {
    expect(await violations(true, theme, true)).toEqual([]);
  },
);

it.each(THEME_NAMES)(
  'the popup in the %s theme, player list open, meets WCAG 2.2 AA',
  async (theme) => {
    expect(await violations(true, theme, false, true)).toEqual([]);
  },
);

it.each(THEME_NAMES)(
  'the popup in the %s theme, Skip Silence card open, meets WCAG 2.2 AA',
  async (theme) => {
    expect(await violations(true, theme, false, false, '#skip-silence-card')).toEqual([]);
  },
);

/** WCAG 2 contrast between two computed `rgb(…)` colours. */
function contrast(a: string, b: string): number {
  const lum = (rgb: string) => {
    const [r, g, bl] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((value) => {
      const c = Number(value) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [light, dark] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

it.each(THEME_NAMES)(
  'the overlay button shows its icon in the %s theme, pressed or not, at 3:1 (WCAG 1.4.11)',
  async (theme) => {
    for (const overlayEnabled of [true, false]) {
      document.body.replaceChildren();
      const popup = await startPopup({
        document,
        l10n: ENGLISH,
        settings: memorySettings({ theme, overlayEnabled }),
        profiles: memoryProfiles(),
        connect: async () => 'page-unavailable',
        copy: async () => true,
        openOptions: () => {},
        stats: memoryStats(),
        mount: (root) => document.body.append(root),
      });
      cleanups.push(() => popup.close());
      await settled();
      const button = popup.view.root.querySelector<HTMLElement>('.top [aria-pressed]');
      if (button === null) throw new Error('no overlay button');
      expect(button.getAttribute('aria-pressed')).toBe(String(overlayEnabled));
      const style = getComputedStyle(button);
      expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      const behind = getComputedStyle(document.body).backgroundColor;
      expect(contrast(style.color, behind)).toBeGreaterThanOrEqual(3);
    }
  },
);
