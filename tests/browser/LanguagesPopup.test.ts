// The popup in every interface language, real and pseudo: within the 600 px a browser gives a
// popup, nothing out of its box, no text cut, mirrored for right-to-left languages while the
// timeline keeps running left to right.

import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import '../../entrypoints/popup/style.css';
import { createMediaEngine } from '../../src/core/MediaEngine.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import type { Localization } from '../../src/ui/i18n.ts';
import { startPopup } from '../../src/ui/popup/Popup.ts';
import { engineState } from '../unit/state.ts';
import { LANGUAGES } from './languages.ts';
import { layoutFaults } from './layout.ts';
import { mountMedia, ready, resetPage, seekTo } from './media.ts';
import {
  localClient,
  memoryProfiles,
  memorySettings,
  memoryStats,
  STORE_REVIEW_URL,
  settled,
} from './ui.ts';

/** The tallest popup a browser shows without scrolling. */
const POPUP_MAX_HEIGHT = 600;
/** The loop explanation's reading width; it opens up to 280 px. */
const HELP_MIN_WIDTH = 240;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

async function popup(l10n: Localization, withMedia: boolean) {
  // Taller than a popup can be, so an overflow is measured instead of hidden.
  await page.viewport(340, 900);
  document.body.style.margin = '0';
  const engine = createMediaEngine(window);
  cleanups.push(() => engine.stop());
  // The presets open: the popup at its tallest.
  const settings = memorySettings({ presetsOpen: true });
  const profiles = memoryProfiles();
  let video: HTMLMediaElement | null = null;
  if (withMedia) {
    video = mountMedia({ seconds: 120, width: 1280, height: 720 });
    // Hours, so times take their widest form (00:00:00); a real file that long is hundreds of MB.
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 3 * 3600 });
    // The player stays out of the popup's way.
    video.style.position = 'fixed';
    video.style.left = '2000px';
    await ready(video);
    const stop = await startPageSession({ window, engine, settings, profiles, l10n: () => l10n });
    cleanups.push(stop);
  }
  const handle = await startPopup({
    document,
    l10n,
    settings,
    profiles,
    connect: async () => (withMedia ? localClient(engine) : 'page-unavailable'),
    copy: async () => true,
    openOptions: () => {},
    reviewUrl: STORE_REVIEW_URL,
    // Hours and minutes, the longest form of the total and of the support line.
    stats: memoryStats(12 * 3600 + 34 * 60),
    mount: (root) => document.body.append(root),
  });
  cleanups.push(() => {
    handle.close();
    handle.view.root.remove();
  });
  if (video !== null) {
    await engine.handleMessage({ v: 1, type: 'set-rate', rate: 1.75 });
    // Both loop markers, so their buttons show times.
    await seekTo(video, 30);
    await engine.handleMessage({ v: 1, type: 'loop-set-a' });
    await seekTo(video, 90);
    await engine.handleMessage({ v: 1, type: 'loop-set-b' });
    // A notice, the longest the popup shows.
    handle.view.say(l10n.t('rateInvalid', '0,10×', '16,00×'));
  }
  await settled();
  await settled();
  return handle.view;
}

const viewport = () => new DOMRect(0, 0, document.documentElement.clientWidth, 900);

describe.each(LANGUAGES)('popup in $name', ({ l10n }) => {
  it('fits, with nothing cut or out of its box, while a player plays', async () => {
    const { root } = await popup(l10n, true);
    expect(root.getBoundingClientRect().height).toBeLessThanOrEqual(POPUP_MAX_HEIGHT);
    expect(layoutFaults(root, viewport())).toEqual([]);
  });

  it('shows a notice in place of the support line, which comes back after it', async () => {
    const view = await popup(l10n, true);
    const { root } = view;
    const invite = root.querySelector('footer.bottom .invite');
    const notices = root.querySelector('footer.bottom .notices');
    expect(notices?.checkVisibility()).toBe(true);
    expect(invite?.checkVisibility()).toBe(false);
    view.say(null);
    await settled();
    expect(notices?.checkVisibility()).toBe(false);
    expect(invite?.checkVisibility()).toBe(true);
  });

  it('fits with the loop explanation open', async () => {
    const { root } = await popup(l10n, true);
    const help = root.querySelector<HTMLElement>('#loop-help');
    root.querySelector<HTMLButtonElement>('button.info')?.click();
    expect(help?.matches(':popover-open')).toBe(true);
    const box = help?.getBoundingClientRect();
    expect(box?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(POPUP_MAX_HEIGHT);
    // It opens towards the room it has, never squeezed into a narrow column.
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(HELP_MIN_WIDTH);
    expect(layoutFaults(help as HTMLElement, viewport())).toEqual([]);
  });

  it('fits with the Skip Silence card open, its text in the language', async () => {
    const { root } = await popup(l10n, true);
    const card = root.querySelector<HTMLElement>('#skip-silence-card');
    card?.showPopover();
    expect(card?.dir).toBe(l10n.dir);
    const box = card?.getBoundingClientRect();
    expect(box?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(POPUP_MAX_HEIGHT);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(HELP_MIN_WIDTH);
    expect(layoutFaults(card as HTMLElement, viewport())).toEqual([]);
  });

  it('fits when the player is in a frame from another site, with both choices', async () => {
    await page.viewport(340, 900);
    document.body.style.margin = '0';
    const state = engineState({
      players: [],
      activePlayerId: null,
      // A long site name, the widest the message is likely to carry.
      framedSites: ['player.streaming-service-example.com'],
    });
    const handle = await startPopup({
      document,
      l10n,
      settings: memorySettings(),
      profiles: memoryProfiles(),
      connect: async () => ({
        send: async () => ({ ok: true, response: { ok: true, state } }),
        watch(onState) {
          onState(state);
          return () => {};
        },
      }),
      copy: async () => true,
      openOptions: () => {},
      reviewUrl: STORE_REVIEW_URL,
      stats: memoryStats(12 * 3600 + 34 * 60),
      mount: (root) => document.body.append(root),
    });
    cleanups.push(() => {
      handle.close();
      handle.view.root.remove();
    });
    await settled();
    const { root } = handle.view;
    expect(root.querySelector('.message-actions')?.checkVisibility()).toBe(true);
    expect(root.getBoundingClientRect().height).toBeLessThanOrEqual(POPUP_MAX_HEIGHT);
    expect(layoutFaults(root, viewport())).toEqual([]);
  });

  it('fits when the page cannot be reached', async () => {
    const { root } = await popup(l10n, false);
    expect(root.getBoundingClientRect().height).toBeLessThanOrEqual(POPUP_MAX_HEIGHT);
    expect(layoutFaults(root, viewport())).toEqual([]);
  });

  it(`takes the direction of the language (${l10n.dir}), the timeline always left to right`, async () => {
    const { root } = await popup(l10n, true);
    expect(document.documentElement.dir).toBe(l10n.dir);
    expect(document.documentElement.lang).toBe(l10n.locale);
    for (const selector of ['.clocks', '.progress', '.seek-row', 'input.rate', '.presets button']) {
      expect(getComputedStyle(root.querySelector(selector) as Element).direction).toBe('ltr');
    }
    const brand = root.querySelector('.brand')?.getBoundingClientRect();
    const settingsButton = root.querySelector('button.ghost')?.getBoundingClientRect();
    // The settings button sits at the end of the header: right in ltr, left in rtl.
    const atEnd =
      l10n.dir === 'ltr'
        ? (settingsButton?.left ?? 0) > (brand?.left ?? 0)
        : (settingsButton?.left ?? 0) < (brand?.left ?? 0);
    expect(atEnd).toBe(true);
  });
});
