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
