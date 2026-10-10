// FleetFoot Engine on a phone (Firefox for Android): a narrow screen, a finger, a coarse pointer.
// The popup opens as a page of its own there, so it takes the width, and controls fit a finger.
// Each page is measured with its own stylesheet only, as it ships.

import { afterEach, describe, expect, it } from 'vitest';
import '../../entrypoints/popup/style.css';
import { createMediaEngine } from '../../src/core/MediaEngine.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import { startPopup } from '../../src/ui/popup/Popup.ts';
import { LANGUAGES } from '../browser/languages.ts';
import { layoutFaults } from '../browser/layout.ts';
import { loaded, mountMedia, ready, resetPage } from '../browser/media.ts';
import {
  localClient,
  memoryProfiles,
  memorySettings,
  memoryStats,
  STORE_REVIEW_URL,
  settled,
} from '../browser/ui.ts';

/** WCAG 2.5.5: a finger needs 44 × 44 CSS px. */
const FINGER_PX = 44;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
  document.body.replaceChildren();
});

it('is a phone: the pointer is coarse and nothing hovers', () => {
  expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
  expect(window.matchMedia('(hover: none)').matches).toBe(true);
});

describe.each(LANGUAGES)('the popup on a phone in $name', ({ l10n }) => {
  it('takes the width of the screen, fits, and every control fits a finger, 44 × 44', async () => {
    document.body.style.margin = '0';
    const engine = createMediaEngine(window);
    cleanups.push(() => engine.stop());
    // The presets open: every control on screen.
    const settings = memorySettings({ presetsOpen: true });
    const profiles = memoryProfiles();
    const video = mountMedia({ seconds: 120, width: 320, height: 180 });
    video.style.position = 'fixed';
    video.style.left = '2000px';
    await ready(video);
    cleanups.push(await startPageSession({ window, engine, settings, profiles, l10n: () => l10n }));
    const handle = await startPopup({
      document,
      l10n,
      settings,
      profiles,
      connect: async () => localClient(engine),
      copy: async () => true,
      openOptions: () => {},
      reviewUrl: STORE_REVIEW_URL,
      stats: memoryStats(12 * 3600),
      mount: (root) => document.body.append(root),
    });
    cleanups.push(() => handle.close());
    await engine.handleMessage({ v: 1, type: 'set-rate', rate: 1.75 });
    await settled();
    await settled();
    const { root } = handle.view;
    const width = document.documentElement.clientWidth;
    expect(root.getBoundingClientRect().width).toBeCloseTo(width, 0);
    expect(layoutFaults(root, new DOMRect(0, 0, width, Number.POSITIVE_INFINITY))).toEqual([]);
    const small = Array.from(root.querySelectorAll<HTMLElement>('button, input'))
      .filter((control) => control.checkVisibility() && !control.matches('.switch'))
      .filter((control) => {
        const { width, height } = control.getBoundingClientRect();
        return width < FINGER_PX || height < FINGER_PX;
      })
      .map((control) => control.getAttribute('aria-label') ?? control.textContent);
    expect(small).toEqual([]);
  });
});

it('draws the overlay with controls a finger can hit', async () => {
  const video = mountMedia({ seconds: 120, width: 360, height: 220 });
  await loaded(video);
  const engine = createMediaEngine(window);
  cleanups.push(() => engine.stop());
  const stop = await startPageSession({
    window,
    engine,
    settings: memorySettings(),
    profiles: memoryProfiles(),
    l10n: () => LANGUAGES[0]?.l10n ?? (undefined as never),
  });
  cleanups.push(stop);
  // A finger on the player.
  const box = video.getBoundingClientRect();
  window.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerType: 'touch',
      clientX: box.left + 20,
      clientY: box.top + 20,
      bubbles: true,
    }),
  );
  const host = document.querySelector('fleetfoot-engine-overlay');
  expect(host?.checkVisibility()).toBe(true);
  expect(host?.getBoundingClientRect().height ?? 0).toBeGreaterThanOrEqual(FINGER_PX);
});

it('leaves the overlay alone while a finger moves over the player: that is a scroll', async () => {
  const video = mountMedia({ seconds: 120, width: 360, height: 220 });
  await loaded(video);
  const engine = createMediaEngine(window);
  cleanups.push(() => engine.stop());
  cleanups.push(
    await startPageSession({
      window,
      engine,
      settings: memorySettings(),
      profiles: memoryProfiles(),
      l10n: () => LANGUAGES[0]?.l10n ?? (undefined as never),
    }),
  );
  const box = video.getBoundingClientRect();
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerType: 'touch',
      clientX: box.left + 20,
      clientY: box.top + 20,
      bubbles: true,
    }),
  );
  expect(document.querySelector('fleetfoot-engine-overlay')?.checkVisibility() ?? false).toBe(
    false,
  );
});
