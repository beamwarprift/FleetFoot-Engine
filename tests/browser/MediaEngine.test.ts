// Page scenarios from the specification's fixture list (single video, single audio, multiple media,
// dynamic player, multiple visible players), driven through the same message path the extension uses.

import { afterEach, describe, expect, it } from 'vitest';
import {
  createMediaEngine,
  ensureMediaEngine,
  type MediaEngine,
} from '../../src/core/MediaEngine.ts';
import type { Response } from '../../src/core/messages/Protocol.ts';
import { siteOf } from '../../src/core/settings/Sites.ts';
import { loaded, mountMedia, mutationsDelivered, playMuted, resetPage } from './media.ts';

const engines: MediaEngine[] = [];

function engine(): MediaEngine {
  const created = createMediaEngine(window);
  engines.push(created);
  return created;
}

afterEach(() => {
  for (const created of engines.splice(0)) created.stop();
  resetPage();
});

function setRate(target: MediaEngine, rate: unknown): Promise<Response> {
  return target.handleMessage({ v: 1, type: 'set-rate', rate });
}

function pointerDownOn(element: Element): void {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
}

describe('single video', () => {
  it('applies the rate to the video and reports it', async () => {
    const video = mountMedia();
    await loaded(video);
    const response = await setRate(engine(), 1.75);
    expect(response.ok).toBe(true);
    expect(video.playbackRate).toBe(1.75);
    expect(response.state.rate).toBe(1.75);
    expect(response.state.activePlayerId).toBe(response.state.players[0]?.id);
  });

  it('clamps out-of-range rates to the offered limits', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await setRate(target, 99);
    expect(video.playbackRate).toBe(16);
    await setRate(target, 0.01);
    expect(video.playbackRate).toBe(0.1);
  });

  it('rejects a malformed command and leaves the video untouched', async () => {
    const video = mountMedia();
    await loaded(video);
    video.playbackRate = 1.25;
    const response = await setRate(engine(), 'fast');
    expect(response).toMatchObject({ ok: false, error: 'invalid-command' });
    expect(video.playbackRate).toBe(1.25);
    expect(response.state.rate).toBe(1.25);
  });
});

describe('single audio', () => {
  it('controls an <audio> with no visible box like a video', async () => {
    const audio = mountMedia({ kind: 'audio' });
    await loaded(audio);
    const response = await setRate(engine(), 2.2);
    expect(response.ok).toBe(true);
    expect(audio.playbackRate).toBe(2.2);
    // The test page runs inside a frame of the test runner: its players say so.
    const frame = window.top === window.self ? null : { site: siteOf(window.location.hostname) };
    expect(response.state.players).toEqual([
      {
        id: response.state.activePlayerId,
        kind: 'audio',
        playing: false,
        width: 0,
        height: 0,
        frame,
      },
    ]);
  });
});

describe('page without media', () => {
  it('answers no-player instead of failing', async () => {
    expect(await setRate(engine(), 1.5)).toMatchObject({
      ok: false,
      error: 'no-player',
      state: { players: [], activePlayerId: null, rate: null },
    });
  });
});

describe('multiple visible players', () => {
  it('controls the larger player when none is playing', async () => {
    const small = mountMedia({ width: 320, height: 180 });
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(small), loaded(large)]);
    await setRate(engine(), 1.5);
    expect(large.playbackRate).toBe(1.5);
    expect(small.playbackRate).toBe(1);
  });

  it('controls the playing player over a larger paused one', async () => {
    const small = mountMedia({ width: 320, height: 180 });
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(small), loaded(large)]);
    await playMuted(small);
    await setRate(engine(), 1.5);
    expect(small.playbackRate).toBe(1.5);
    expect(large.playbackRate).toBe(1);
  });

  it('controls the player the user touched last', async () => {
    const small = mountMedia({ width: 320, height: 180 });
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(small), loaded(large)]);
    const target = engine();
    pointerDownOn(small);
    await setRate(target, 1.5);
    expect(small.playbackRate).toBe(1.5);
    expect(large.playbackRate).toBe(1);
  });

  it('finds a player covered by a custom control overlay', async () => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:320px;height:180px';
    document.body.append(wrapper);
    const covered = mountMedia({ width: 320, height: 180, parent: wrapper });
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0';
    wrapper.append(overlay);
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(covered), loaded(large)]);
    const target = engine();
    pointerDownOn(overlay);
    await setRate(target, 2.5);
    expect(covered.playbackRate).toBe(2.5);
    expect(large.playbackRate).toBe(1);
  });

  it('keeps an explicit choice and returns to automatic selection on request', async () => {
    const small = mountMedia({ width: 320, height: 180 });
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(small), loaded(large)]);
    const target = engine();
    const smallId = (await target.handleMessage({ v: 1, type: 'get-state' })).state.players.find(
      (player) => player.width === 320,
    )?.id;

    const pinned = await target.handleMessage({
      v: 1,
      type: 'select-player',
      playerId: smallId ?? null,
    });
    expect(pinned).toMatchObject({ ok: true, state: { activePlayerId: smallId, pinned: true } });
    await setRate(target, 1.25);
    expect(small.playbackRate).toBe(1.25);

    await target.handleMessage({ v: 1, type: 'select-player', playerId: null });
    await setRate(target, 3);
    expect(large.playbackRate).toBe(3);
    expect(small.playbackRate).toBe(1.25);
  });

  it('refuses to pin a player that is not on the page', async () => {
    const video = mountMedia();
    await loaded(video);
    expect(
      await engine().handleMessage({ v: 1, type: 'select-player', playerId: 9999 }),
    ).toMatchObject({
      ok: false,
      error: 'no-player',
      state: { pinned: false },
    });
  });
});

describe('dynamic player', () => {
  it('controls a player inserted after the engine started', async () => {
    const target = engine();
    const late = mountMedia();
    await Promise.all([loaded(late), mutationsDelivered()]);
    await setRate(target, 1.75);
    expect(late.playbackRate).toBe(1.75);
  });

  it('moves to the replacement when the player is replaced', async () => {
    const target = engine();
    const first = mountMedia();
    await loaded(first);
    await setRate(target, 1.5);
    first.remove();
    const replacement = mountMedia();
    await Promise.all([loaded(replacement), mutationsDelivered()]);
    const response = await setRate(target, 2);
    expect(replacement.playbackRate).toBe(2);
    expect(response.state.players).toHaveLength(1);
  });
});

describe('pitch', () => {
  it('preserves pitch by default and applies the setting with every rate change', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    video.preservesPitch = false;
    await setRate(target, 2);
    expect(video.preservesPitch).toBe(true);

    expect(
      await target.handleMessage({ v: 1, type: 'set-preserves-pitch', enabled: false }),
    ).toMatchObject({
      ok: true,
      state: { preservesPitch: false },
    });
    expect(video.preservesPitch).toBe(false);
    video.preservesPitch = true;
    await setRate(target, 1.5);
    expect(video.preservesPitch).toBe(false);
  });
});

describe('repeated injection', () => {
  it('reuses one engine per page', () => {
    const host = {} as typeof globalThis;
    const first = ensureMediaEngine(host, window);
    const second = ensureMediaEngine(host, window);
    engines.push(first);
    expect(second).toBe(first);
  });
});
