// WCAG 2.2 AA, checked by axe-core on the options page as styled for real.

import axe from 'axe-core';
import { expect, it } from 'vitest';
import '../../entrypoints/options/style.css';
import { sitePatterns } from '../../src/core/settings/Sites.ts';
import { THEME_NAMES } from '../../src/core/settings/Themes.ts';
import { startOptions } from '../../src/ui/options/Options.ts';
import {
  ENGLISH,
  memoryAccess,
  memoryLocalData,
  memoryProfiles,
  memorySettings,
  memoryStats,
  settled,
  TEST_VERSION,
  WCAG_22_AA,
} from './ui.ts';

it.each(THEME_NAMES)('the options page in the %s theme meets WCAG 2.2 AA', async (theme) => {
  document.body.replaceChildren();
  document.documentElement.lang = 'en';
  document.title = 'FleetFoot Engine';
  let root: HTMLElement | null = null;
  const stop = await startOptions({
    localData: memoryLocalData(),
    version: TEST_VERSION,
    // The site sections filled in: a remembered site and a chosen site.
    profiles: memoryProfiles({ 'site:youtube.com': { playbackRate: 1.75 } }),
    access: memoryAccess(sitePatterns('youtube.com')),
    document,
    l10n: ENGLISH,
    settings: memorySettings({ theme, memory: 'site' }),
    layout: null,
    browserShortcuts: { open: () => {} },
    contextMenu: true,
    stats: memoryStats(5400),
    mount: (element) => {
      root = element;
      document.body.append(element);
    },
  });
  await settled();
  await settled();
  for (const profile of (root as unknown as HTMLElement).querySelectorAll('details')) {
    profile.open = true;
  }
  const result = await axe.run(root as unknown as HTMLElement, {
    runOnly: { type: 'tag', values: WCAG_22_AA },
  });
  stop();
  expect(
    result.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
});

it.each(THEME_NAMES)(
  'marks a refused field in the danger colour in the %s theme',
  async (theme) => {
    document.body.replaceChildren();
    let root: HTMLElement | null = null;
    const stop = await startOptions({
      localData: memoryLocalData(),
      version: TEST_VERSION,
      profiles: memoryProfiles(),
      access: memoryAccess(sitePatterns('youtube.com')),
      document,
      l10n: ENGLISH,
      settings: memorySettings({ theme }),
      layout: null,
      browserShortcuts: { open: () => {} },
      contextMenu: true,
      stats: memoryStats(0),
      mount: (element) => {
        root = element;
        document.body.append(element);
      },
    });
    await settled();
    const adder = (root as unknown as HTMLElement).querySelector('.site-adder');
    const input = adder?.querySelector('input');
    if (input === null || input === undefined) throw new Error('no site field');
    const border = getComputedStyle(input).borderTopColor;
    input.value = 'not a site';
    adder?.querySelector('button')?.click();
    await settled();
    // The colour the theme gives to danger, resolved by the browser itself.
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger)';
    input.after(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    stop();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(getComputedStyle(input).borderTopColor).toBe(danger);
    expect(border).not.toBe(danger);
  },
);
