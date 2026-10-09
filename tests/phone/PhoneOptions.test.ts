// The options page on a phone (Firefox for Android): no browser shortcuts, no right-click menu, a
// narrow screen and a finger. Measured with its own stylesheet only, as it ships.

import { afterEach, describe, expect, it } from 'vitest';
import '../../entrypoints/options/style.css';
import { startOptions } from '../../src/ui/options/Options.ts';
import { LANGUAGES } from '../browser/languages.ts';
import { layoutFaults } from '../browser/layout.ts';
import { resetPage } from '../browser/media.ts';
import {
  memoryAccess,
  memoryLocalData,
  memoryProfiles,
  memorySettings,
  memoryStats,
  settled,
  TEST_VERSION,
} from '../browser/ui.ts';

/** WCAG 2.5.5: a finger needs 44 × 44 CSS px. */
const FINGER_PX = 44;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
  document.body.replaceChildren();
});

describe.each(LANGUAGES)('the options page on a phone in $name', ({ l10n }) => {
  it('fits the screen at the largest text size, the keys open', async () => {
    document.body.style.margin = '0';
    let root: HTMLElement | null = null;
    const stop = await startOptions({
      localData: memoryLocalData(),
      version: TEST_VERSION,
      document,
      l10n,
      settings: memorySettings({ memory: 'site', textSize: 200 }),
      profiles: memoryProfiles({ 'site:youtube.com': { playbackRate: 1.75 } }),
      access: memoryAccess(),
      layout: null,
      browserShortcuts: null,
      contextMenu: false,
      stats: memoryStats(3600),
      mount: (element) => {
        root = element;
        document.body.append(element);
      },
    });
    cleanups.push(stop);
    await settled();
    const page = root as unknown as HTMLElement;
    for (const card of page.querySelectorAll('details')) card.open = true;
    expect(document.documentElement.style.zoom).toBe('2');
    const width = document.documentElement.clientWidth;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    expect(layoutFaults(page, new DOMRect(0, 0, width, Number.POSITIVE_INFINITY))).toEqual([]);
  });

  it('fits the screen, and every control fits a finger, 44 × 44', async () => {
    document.body.style.margin = '0';
    let root: HTMLElement | null = null;
    const stop = await startOptions({
      localData: memoryLocalData(),
      version: TEST_VERSION,
      document,
      l10n,
      settings: memorySettings({ memory: 'site' }),
      profiles: memoryProfiles({ 'site:youtube.com': { playbackRate: 1.75 } }),
      access: memoryAccess(),
      layout: null,
      // A phone has neither the browser's shortcuts nor its right-click menu.
      browserShortcuts: null,
      contextMenu: false,
      stats: memoryStats(3600),
      mount: (element) => {
        root = element;
        document.body.append(element);
      },
    });
    cleanups.push(stop);
    await settled();
    const page = root as unknown as HTMLElement;
    // A phone seldom has a keyboard: the keys start folded, and a tap on their title opens them.
    const keys = page.querySelector<HTMLDetailsElement>('details.keys');
    if (keys === null) throw new Error('no keys');
    expect(keys.open).toBe(false);
    expect(keys.querySelector('.shortcuts')?.checkVisibility()).toBe(false);
    keys.querySelector('summary')?.click();
    expect(keys.open).toBe(true);
    expect(keys.querySelector('.shortcuts')?.checkVisibility()).toBe(true);
    for (const card of page.querySelectorAll('details')) card.open = true;
    const width = document.documentElement.clientWidth;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    expect(layoutFaults(page, new DOMRect(0, 0, width, Number.POSITIVE_INFINITY))).toEqual([]);
    const small = Array.from(
      page.querySelectorAll<HTMLElement>('button, select, input[type="text"], summary'),
    )
      .filter((control) => control.checkVisibility())
      .filter((control) => {
        const { width, height } = control.getBoundingClientRect();
        return width < FINGER_PX || height < FINGER_PX;
      })
      .map((control) => control.getAttribute('aria-label') ?? control.textContent);
    expect(small).toEqual([]);
    // Each key name within two lines on the narrowest common phone, controls at finger size.
    const lines = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
    };
    const long = Array.from(page.querySelectorAll('.shortcuts th'))
      .filter((name) => lines(name) > 2)
      .map((name) => name.textContent);
    expect(long).toEqual([]);
  });
});
