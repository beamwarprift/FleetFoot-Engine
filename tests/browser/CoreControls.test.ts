// Core controls on real media: steps, reset, previous, hold, seek, remaining time.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import type { Response } from '../../src/core/messages/Protocol.ts';
import { eventsDelivered, loaded, mountMedia, playMuted, resetPage, track } from './media.ts';

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

type Send = (message: Record<string, unknown>) => Promise<Response>;

async function oneVideo(seconds = 120): Promise<{ video: HTMLMediaElement; send: Send }> {
  const video = mountMedia({ seconds });
  await loaded(video);
  const target = engine();
  return { video, send: (message) => target.handleMessage({ v: 1, ...message }) };
}

/** A live source: a canvas stream has no end and nothing to seek to. */
async function liveVideo(): Promise<HTMLVideoElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  canvas.getContext('2d')?.fillRect(0, 0, 64, 36);
  const video = track(document.createElement('video'));
  video.style.cssText = 'display:block;width:640px;height:360px';
  video.muted = true;
  video.srcObject = canvas.captureStream(5);
  document.body.append(video);
  await loaded(video);
  return video;
}

/**
 * Narrows what the element reports as seekable, as a DVR window or a partially available stream
 * does. The browser still clamps writes only to [0, duration], so the engine's own clamp shows.
 */
function withSeekableWindow(media: HTMLMediaElement, start: number, end: number): void {
  const window: TimeRanges = {
    length: 1,
    start: (index: number) => (index === 0 ? start : Number.NaN),
    end: (index: number) => (index === 0 ? end : Number.NaN),
  };
  Object.defineProperty(media, 'seekable', { configurable: true, get: () => window });
}

describe('rate steps', () => {
  it('steps from the current rate on the 0.01 grid', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.75 });
    await send({ type: 'adjust-rate', delta: 0.1 });
    expect(video.playbackRate).toBe(1.85);
    await send({ type: 'adjust-rate', delta: -0.25 });
    expect(video.playbackRate).toBe(1.6);
  });

  it('stops at the limits of the offered range', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 0.25 });
    await send({ type: 'adjust-rate', delta: -0.25 });
    expect(video.playbackRate).toBe(0.1);
    await send({ type: 'set-rate', rate: 15.5 });
    await send({ type: 'adjust-rate', delta: 1 });
    expect(video.playbackRate).toBe(16);
  });

  it('starts from a rate the site set off the grid', async () => {
    const { video, send } = await oneVideo();
    video.playbackRate = 1.337;
    await send({ type: 'adjust-rate', delta: 0.25 });
    expect(video.playbackRate).toBe(1.59);
  });
});

describe('reset and previous rate', () => {
  it('resets to 1.00× and toggles back with previous-rate', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.75 });
    expect((await send({ type: 'reset-rate' })).state).toMatchObject({
      rate: 1,
      previousRate: 1.75,
    });
    expect(video.playbackRate).toBe(1);

    expect((await send({ type: 'previous-rate' })).state).toMatchObject({
      rate: 1.75,
      previousRate: 1,
    });
    await send({ type: 'previous-rate' });
    expect(video.playbackRate).toBe(1);
  });

  it('keeps the real previous rate when the same rate is set again', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.5 });
    await send({ type: 'set-rate', rate: 2 });
    await send({ type: 'set-rate', rate: 2 });
    await send({ type: 'previous-rate' });
    expect(video.playbackRate).toBe(1.5);
  });

  it('answers no-previous-rate before any change', async () => {
    const { video, send } = await oneVideo();
    expect(await send({ type: 'previous-rate' })).toMatchObject({
      ok: false,
      error: 'no-previous-rate',
    });
    expect(video.playbackRate).toBe(1);
  });

  it('keeps a separate previous rate for each player', async () => {
    const first = mountMedia({ width: 960, height: 540 });
    const second = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(first), loaded(second)]);
    const target = engine();
    const send: Send = (message) => target.handleMessage({ v: 1, ...message });
    await send({ type: 'set-rate', rate: 2 });
    const secondId = (await send({ type: 'get-state' })).state.players.find(
      (p) => p.width === 320,
    )?.id;
    await send({ type: 'select-player', playerId: secondId ?? null });
    expect(await send({ type: 'previous-rate' })).toMatchObject({
      ok: false,
      error: 'no-previous-rate',
    });
    expect(first.playbackRate).toBe(2);
  });
});

describe('hold to speed', () => {
  it('applies the hold rate and restores the rate it found on release', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.5 });
    expect((await send({ type: 'hold-start', rate: 3 })).state).toMatchObject({
      holding: true,
      rate: 3,
    });
    expect(video.playbackRate).toBe(3);
    expect((await send({ type: 'hold-end' })).state).toMatchObject({ holding: false, rate: 1.5 });
    expect(video.playbackRate).toBe(1.5);
  });

  it('ignores keyboard autorepeat while held, without touching the rate again', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.25 });
    await send({ type: 'hold-start', rate: 3 });
    // Let the ratechange events of the two writes above arrive before counting.
    await eventsDelivered();
    let changes = 0;
    video.addEventListener('ratechange', () => changes++);
    await send({ type: 'hold-start', rate: 3 });
    await send({ type: 'hold-start', rate: 3 });
    await eventsDelivered();
    expect(changes).toBe(0);
    await send({ type: 'hold-end' });
    expect(video.playbackRate).toBe(1.25);
  });

  it('never remembers the temporary rate as the previous one', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 2 });
    await send({ type: 'hold-start', rate: 3 });
    await send({ type: 'hold-end' });
    expect((await send({ type: 'get-state' })).state.previousRate).toBe(1);
    await send({ type: 'previous-rate' });
    expect(video.playbackRate).toBe(1);
  });

  it('ends the hold without restoring when the user picks a rate meanwhile', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.5 });
    await send({ type: 'hold-start', rate: 3 });
    expect((await send({ type: 'set-rate', rate: 2.25 })).state).toMatchObject({
      holding: false,
      rate: 2.25,
      previousRate: 1.5,
    });
    await send({ type: 'hold-end' });
    expect(video.playbackRate).toBe(2.25);
  });

  it('treats a release without a hold as a no-op', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.75 });
    expect((await send({ type: 'hold-end' })).ok).toBe(true);
    expect(video.playbackRate).toBe(1.75);
  });

  it('restores the held player even if another one became active', async () => {
    const held = mountMedia({ width: 960, height: 540 });
    const other = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(held), loaded(other)]);
    const target = engine();
    const send: Send = (message) => target.handleMessage({ v: 1, ...message });
    await send({ type: 'set-rate', rate: 1.5 });
    await send({ type: 'hold-start', rate: 3 });
    const otherId = (await send({ type: 'get-state' })).state.players.find(
      (p) => p.width === 320,
    )?.id;
    await send({ type: 'select-player', playerId: otherId ?? null });
    await send({ type: 'hold-end' });
    expect(held.playbackRate).toBe(1.5);
    expect(other.playbackRate).toBe(1);
  });
});

describe('hold to speed, at its edges', () => {
  it('holds only the players it started on, even as autorepeat goes on after another became active', async () => {
    const held = mountMedia({ width: 960, height: 540 });
    const other = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(held), loaded(other)]);
    const target = engine();
    const send: Send = (message) => target.handleMessage({ v: 1, ...message });
    await send({ type: 'hold-start', rate: 3 });
    const otherId = (await send({ type: 'get-state' })).state.players.find(
      (p) => p.width === 320,
    )?.id;
    await send({ type: 'select-player', playerId: otherId ?? null });
    await send({ type: 'hold-start', rate: 3 });
    expect(other.playbackRate).toBe(1);
    await send({ type: 'hold-end' });
    expect([held.playbackRate, other.playbackRate]).toEqual([1, 1]);
  });

  it('steps from the speed before the hold, not from the hold speed', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.5 });
    await send({ type: 'hold-start', rate: 3 });
    await send({ type: 'adjust-rate', delta: 0.25 });
    expect(video.playbackRate).toBe(1.75);
  });

  it('gives a player taken out of the page during a hold its speed back when it returns', async () => {
    const { video, send } = await oneVideo();
    await send({ type: 'set-rate', rate: 1.5 });
    await send({ type: 'hold-start', rate: 3 });
    const parent = video.parentNode;
    video.remove();
    await send({ type: 'hold-end' });
    parent?.appendChild(video);
    expect(video.playbackRate).toBe(1.5);
  });
});

describe('speed for the media the user pointed at', () => {
  async function twoVideos() {
    const playing = mountMedia({ width: 960, height: 540 });
    const paused = mountMedia({ width: 640, height: 360, seconds: 90 });
    await Promise.all([loaded(playing), loaded(paused)]);
    const target = engine();
    const send: Send = (message) => target.handleMessage({ v: 1, ...message });
    await playMuted(playing);
    return { playing, paused, send };
  }

  it('changes the one clicked, not the one playing, and «previous» goes back on it', async () => {
    const { playing, paused, send } = await twoVideos();
    await send({ type: 'set-media-rate', src: paused.currentSrc, rate: 2 });
    expect([playing.playbackRate, paused.playbackRate]).toEqual([1, 2]);
    await send({ type: 'set-media-rate', src: paused.currentSrc, rate: 1.5 });
    expect((await send({ type: 'get-state' })).state.activePlayerId).not.toBeNull();
    expect(paused.playbackRate).toBe(1.5);
    expect(playing.playbackRate).toBe(1);
  });

  it('falls back to the active player for an address it does not have', async () => {
    const { playing, paused, send } = await twoVideos();
    expect((await send({ type: 'set-media-rate', src: 'blob:nowhere', rate: 2 })).ok).toBe(true);
    expect([playing.playbackRate, paused.playbackRate]).toEqual([2, 1]);
  });

  it('covers every player with «all players», as any speed does', async () => {
    const { playing, paused, send } = await twoVideos();
    await send({ type: 'set-target', target: 'all' });
    await send({ type: 'set-media-rate', src: paused.currentSrc, rate: 1.75 });
    expect([playing.playbackRate, paused.playbackRate]).toEqual([1.75, 1.75]);
  });
});

describe('seek', () => {
  it('moves by the given seconds both ways', async () => {
    const { video, send } = await oneVideo(120);
    video.currentTime = 30;
    await send({ type: 'seek', seconds: 10 });
    expect(video.currentTime).toBeCloseTo(40, 1);
    await send({ type: 'seek', seconds: -15 });
    expect(video.currentTime).toBeCloseTo(25, 1);
  });

  it('stops at the start and at the end', async () => {
    const { video, send } = await oneVideo(120);
    video.currentTime = 3;
    await send({ type: 'seek', seconds: -5 });
    expect(video.currentTime).toBe(0);
    video.currentTime = 110;
    await send({ type: 'seek', seconds: 60 });
    expect(video.currentTime).toBeCloseTo(video.duration, 1);
  });

  it('stays inside a seekable window narrower than the media', async () => {
    const { video, send } = await oneVideo(120);
    withSeekableWindow(video, 20, 80);
    video.currentTime = 25;
    await send({ type: 'seek', seconds: -10 });
    expect(video.currentTime).toBeCloseTo(20, 1);
    video.currentTime = 75;
    await send({ type: 'seek', seconds: 10 });
    expect(video.currentTime).toBeCloseTo(80, 1);
  });

  it('keeps a live stream not seekable even with a DVR window', async () => {
    const live = await liveVideo();
    withSeekableWindow(live, 0, 30);
    const target = engine();
    expect(await target.handleMessage({ v: 1, type: 'seek', seconds: -5 })).toMatchObject({
      ok: false,
      error: 'not-seekable',
      state: { seekable: false },
    });
  });

  it('reports a live stream as not seekable and leaves it untouched', async () => {
    await liveVideo();
    const target = engine();
    const state = (await target.handleMessage({ v: 1, type: 'get-state' })).state;
    expect(state).toMatchObject({ seekable: false, duration: null, remaining: null });
    expect(await target.handleMessage({ v: 1, type: 'seek', seconds: 5 })).toMatchObject({
      ok: false,
      error: 'not-seekable',
    });
  });

  it('reports media without loaded metadata as not seekable', async () => {
    const video = mountMedia();
    video.preload = 'none';
    video.removeAttribute('src');
    video.load();
    const target = engine();
    expect(await target.handleMessage({ v: 1, type: 'seek', seconds: 5 })).toMatchObject({
      ok: false,
      error: 'not-seekable',
      state: { seekable: false },
    });
  });
});

describe('remaining time', () => {
  it('reports the time left at 1× and at the current rate', async () => {
    const { video, send } = await oneVideo(120);
    video.currentTime = 30;
    const state = (await send({ type: 'set-rate', rate: 2 })).state;
    expect(state.duration).toBeCloseTo(120, 1);
    expect(state.currentTime).toBeCloseTo(30, 1);
    expect(state.remaining?.original).toBeCloseTo(90, 1);
    expect(state.remaining?.atRate).toBeCloseTo(45, 1);
  });

  it('takes a zero duration for an unknown one', async () => {
    const { video, send } = await oneVideo(120);
    // Some players report 0 before their source is ready.
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 0 });
    expect((await send({ type: 'get-state' })).state.duration).toBeNull();
  });
});
