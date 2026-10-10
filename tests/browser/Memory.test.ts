// What is remembered between visits, on real media: the remembered speed given when the extension
// arrives, deliberate changes kept as the memory says, holds never kept, site profiles over the
// general settings, and changes made from the page saved where the page reads them.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { DEFAULT_SETTINGS } from '../../src/core/settings/Settings.ts';
import { siteOf } from '../../src/core/settings/Sites.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import { eventsDelivered, loaded, mountMedia, mutationsDelivered, resetPage } from './media.ts';
import { ENGLISH, memoryProfiles, memorySettings, settled } from './ui.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

/** The site of the test page, as the engine names it. */
const SITE = siteOf(window.location.hostname) ?? '';

function engine(): MediaEngine {
  const created = createMediaEngine(window);
  cleanups.push(() => created.stop());
  return created;
}

const send = (target: MediaEngine, message: Record<string, unknown>) =>
  target.handleMessage({ v: 1, ...message });

async function session(
  stored: Record<string, unknown>,
  remembered: Record<string, unknown> = {},
  target: MediaEngine = engine(),
) {
  const settings = memorySettings(stored);
  const profiles = memoryProfiles(remembered);
  const stop = await startPageSession({
    window,
    engine: target,
    settings,
    profiles,
    l10n: () => ENGLISH,
  });
  cleanups.push(stop);
  return { engine: target, settings, profiles };
}

describe('the remembered speed in the engine', () => {
  it('goes to the player there now, as a choice the previous speed can undo', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await send(target, { type: 'set-default-rate', rate: 1.75 });
    expect(video.playbackRate).toBe(1.75);
    await send(target, { type: 'previous-rate' });
    expect(video.playbackRate).toBe(1);
  });

  it('waits for the first player even with FOLLOW, which then leaves later players alone', async () => {
    const target = engine();
    await send(target, { type: 'set-rate-policy', policy: 'follow' });
    await send(target, { type: 'set-default-rate', rate: 1.5 });
    const first = mountMedia();
    await loaded(first);
    await mutationsDelivered();
    expect(first.playbackRate).toBe(1.5);
    first.remove();
    const second = mountMedia();
    await loaded(second);
    await mutationsDelivered();
    expect(second.playbackRate).toBe(1);
  });

  it('never overrides a choice already made on the page', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await send(target, { type: 'set-rate', rate: 2 });
    await send(target, { type: 'set-default-rate', rate: 1.25 });
    expect(video.playbackRate).toBe(2);
  });

  it('reports the site of its page', async () => {
    expect((await send(engine(), { type: 'get-state' })).state.site).toBe(SITE);
  });
});

describe('memory: one speed for every site', () => {
  it('starts the page at the remembered speed and keeps the next deliberate change', async () => {
    const video = mountMedia();
    await loaded(video);
    const { engine: target, profiles } = await session({}, { rememberedRate: 1.5 });
    expect(video.playbackRate).toBe(1.5);
    await send(target, { type: 'set-rate', rate: 2 });
    await settled();
    expect(profiles.stored['rememberedRate']).toBe(2);
  });

  it('never keeps a hold', async () => {
    const video = mountMedia();
    await loaded(video);
    const { engine: target, profiles } = await session({}, { rememberedRate: 1.5 });
    await send(target, { type: 'hold-start', rate: 3 });
    await settled();
    expect(video.playbackRate).toBe(3);
    expect(profiles.stored['rememberedRate']).toBe(1.5);
    await send(target, { type: 'hold-end' });
    await eventsDelivered();
    expect(video.playbackRate).toBe(1.5);
  });
});

describe('memory: nothing', () => {
  it('leaves the page at its own speed and keeps no change', async () => {
    const video = mountMedia();
    await loaded(video);
    const { engine: target, profiles } = await session({ memory: 'none' }, { rememberedRate: 1.5 });
    expect(video.playbackRate).toBe(1);
    await send(target, { type: 'set-rate', rate: 2 });
    await settled();
    expect(profiles.stored['rememberedRate']).toBe(1.5);
  });
});

describe('memory: a speed for each site', () => {
  it("starts at the site's speed with its settings, and keeps changes in its profile only", async () => {
    const video = mountMedia();
    await loaded(video);
    const { engine: target, profiles } = await session(
      { memory: 'site' },
      { rememberedRate: 3, [`site:${SITE}`]: { playbackRate: 1.25, preservesPitch: false } },
    );
    expect(video.playbackRate).toBe(1.25);
    expect(video.preservesPitch).toBe(false);
    await send(target, { type: 'set-rate', rate: 2 });
    await settled();
    expect(profiles.stored[`site:${SITE}`]).toEqual({ playbackRate: 2, preservesPitch: false });
    expect(profiles.stored['rememberedRate']).toBe(3);
  });

  it('follows a profile edited elsewhere while the page is open', async () => {
    const video = mountMedia();
    await loaded(video);
    const { engine: target, profiles } = await session({ memory: 'site' });
    expect(video.preservesPitch).toBe(true);
    await profiles.update(SITE, { preservesPitch: false });
    await settled();
    await settled();
    expect((await send(target, { type: 'get-state' })).state.preservesPitch).toBe(false);
    expect(video.preservesPitch).toBe(false);
  });

  it('saves a shortcut change in the site profile, where the page reads it', async () => {
    const video = mountMedia();
    await loaded(video);
    const { settings, profiles } = await session({
      memory: 'site',
      bindings: {
        ...DEFAULT_SETTINGS.bindings,
        'toggle-pitch': { code: 'KeyN', alt: true, ctrl: false, meta: false, shift: false },
      },
    });
    const keys = { code: 'KeyN', altKey: true, bubbles: true, cancelable: true };
    document.body.dispatchEvent(new KeyboardEvent('keydown', keys));
    document.body.dispatchEvent(new KeyboardEvent('keyup', keys));
    await settled();
    await settled();
    expect(profiles.stored[`site:${SITE}`]).toEqual({ preservesPitch: false });
    expect(settings.stored['preservesPitch']).toBeUndefined();
    expect(video.preservesPitch).toBe(false);
  });
});
