// Engine behaviour the interface relies on: LOCK yielding to a tug of war, Picture-in-Picture,
// and the state pushed on change.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { CONTEST_LIMIT, CONTEST_WINDOW_MS } from '../../src/core/media/RatePolicy.ts';
import type { EngineState } from '../../src/core/messages/Protocol.ts';
import { parseEngineState } from '../../src/core/messages/StateValidation.ts';
import {
  eventsDelivered,
  loaded,
  mountMedia,
  playMuted,
  ready,
  resetPage,
  until,
} from './media.ts';

const engines: MediaEngine[] = [];

function engine(): MediaEngine {
  const created = createMediaEngine(window);
  engines.push(created);
  return created;
}

function send(target: MediaEngine, message: Record<string, unknown>) {
  return target.handleMessage({ v: 1, ...message });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  for (const created of engines.splice(0)) created.stop();
  resetPage();
});

describe('LOCK against another source', () => {
  it('yields after a few immediate answers, says so, and takes over again on a deliberate change', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await send(target, { type: 'set-rate-policy', policy: 'lock' });
    await send(target, { type: 'set-rate', rate: 2 });
    let restores = 0;
    let competing = true;
    // Another extension forcing 1× on every change, as fast as events allow.
    video.addEventListener('ratechange', () => {
      if (video.playbackRate === 2) restores++;
      if (competing && video.playbackRate !== 1) video.playbackRate = 1;
    });
    video.playbackRate = 1;
    await eventsDelivered();
    await eventsDelivered();
    expect(restores).toBeGreaterThan(0);
    expect(restores).toBeLessThanOrEqual(CONTEST_LIMIT + 1);
    expect(video.playbackRate).toBe(1);
    expect((await send(target, { type: 'get-state' })).state.rateContested).toBe(true);

    competing = false;
    expect((await send(target, { type: 'set-rate', rate: 2 })).state.rateContested).toBe(false);
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(2);
  });

  it('keeps overruling a page that resets the rate from time to time', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await send(target, { type: 'set-rate-policy', policy: 'lock' });
    await send(target, { type: 'set-rate', rate: 2 });
    for (let reset = 0; reset < CONTEST_LIMIT + 3; reset++) {
      await wait(CONTEST_WINDOW_MS + 50);
      video.playbackRate = 1;
      await eventsDelivered();
      expect(video.playbackRate).toBe(2);
    }
    expect((await send(target, { type: 'get-state' })).state.rateContested).toBe(false);
  });

  it('takes every element back when LOCK is chosen again', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    await send(target, { type: 'set-rate-policy', policy: 'lock' });
    await send(target, { type: 'set-rate', rate: 2 });
    const force = () => {
      if (video.playbackRate !== 1) video.playbackRate = 1;
    };
    video.addEventListener('ratechange', force);
    video.playbackRate = 1;
    await eventsDelivered();
    await eventsDelivered();
    video.removeEventListener('ratechange', force);
    expect((await send(target, { type: 'get-state' })).state.rateContested).toBe(true);
    await send(target, { type: 'set-rate-policy', policy: 'lock' });
    expect(video.playbackRate).toBe(2);
  });
});

describe('Picture-in-Picture', () => {
  it('is never offered for audio', async () => {
    const audio = mountMedia({ kind: 'audio' });
    await loaded(audio);
    const target = engine();
    expect((await send(target, { type: 'get-state' })).state.pip).toEqual({
      available: false,
      active: false,
    });
    expect(await send(target, { type: 'pip-toggle' })).toMatchObject({
      ok: false,
      error: 'pip-unavailable',
    });
  });

  it('respects a video that disables it', async () => {
    const video = mountMedia() as HTMLVideoElement;
    video.disablePictureInPicture = true;
    await loaded(video);
    expect(await send(engine(), { type: 'pip-toggle' })).toMatchObject({
      ok: false,
      error: 'pip-unavailable',
    });
  });

  it('follows the capability of the browser, and reports a refusal', async () => {
    const video = mountMedia() as HTMLVideoElement;
    await loaded(video);
    const target = engine();
    const supported =
      typeof video.requestPictureInPicture === 'function' &&
      document.pictureInPictureEnabled === true;
    expect((await send(target, { type: 'get-state' })).state.pip.available).toBe(supported);
    // No user gesture in the page: a browser that offers it refuses, one that does not lacks it.
    expect(await send(target, { type: 'pip-toggle' })).toMatchObject({
      ok: false,
      error: supported ? 'pip-rejected' : 'pip-unavailable',
    });
  });
});

describe('pushed state', () => {
  it('starts with the current state, valid for the interface', () => {
    const target = engine();
    let first: EngineState | null = null;
    const stop = target.subscribe(
      (state) => {
        first ??= state;
      },
      { time: false },
    );
    stop();
    expect(first).not.toBeNull();
    expect(parseEngineState(first)).toEqual(first);
  });

  it('pushes a command result once, and nothing when nothing visible changed', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    const pushed: EngineState[] = [];
    const stop = target.subscribe((state) => pushed.push(state), { time: false });
    pushed.length = 0;
    await send(target, { type: 'set-rate', rate: 1.5 });
    await eventsDelivered();
    expect(pushed.map((state) => state.rate)).toEqual([1.5]);
    await send(target, { type: 'get-state' });
    await eventsDelivered();
    expect(pushed).toHaveLength(1);
    stop();
  });

  it('without time, playback pushes nothing once it is playing', async () => {
    const video = mountMedia({ seconds: 30 });
    await loaded(video);
    await ready(video);
    const target = engine();
    const pushed: EngineState[] = [];
    const stop = target.subscribe((state) => pushed.push(state), { time: false });
    await playMuted(video);
    await eventsDelivered();
    const afterStart = pushed.length;
    await until(video, () => video.currentTime > 2.2);
    expect(pushed.length).toBe(afterStart);
    stop();
  });

  it('with time, pushes once per second shown, not per timeupdate', async () => {
    const video = mountMedia({ seconds: 30 });
    await loaded(video);
    await ready(video);
    const target = engine();
    let updates = 0;
    video.addEventListener('timeupdate', () => updates++);
    const pushed: EngineState[] = [];
    const stop = target.subscribe((state) => pushed.push(state), { time: true });
    await playMuted(video);
    await until(video, () => video.currentTime > 3.2);
    const seconds = new Set(pushed.map((state) => Math.floor(state.currentTime ?? -1)));
    expect(seconds.size).toBeGreaterThanOrEqual(3);
    expect(pushed.length).toBeLessThan(updates);
    stop();
  });

  it('stops listening to the media when the last subscriber leaves', async () => {
    const video = mountMedia();
    await loaded(video);
    const target = engine();
    const pushed: EngineState[] = [];
    const stop = target.subscribe((state) => pushed.push(state), { time: true });
    stop();
    pushed.length = 0;
    video.playbackRate = 3;
    await eventsDelivered();
    await send(target, { type: 'set-rate', rate: 2 });
    await eventsDelivered();
    expect(pushed).toEqual([]);
  });
});

describe('time saved', () => {
  function counting(): { target: MediaEngine; reports: number[] } {
    const reports: number[] = [];
    const created = createMediaEngine(window, { onTimeSaved: (seconds) => reports.push(seconds) });
    engines.push(created);
    return { target: created, reports };
  }

  it('counts what playing faster saved on a player FleetFoot Engine sped up', async () => {
    const video = mountMedia({ seconds: 60 });
    await loaded(video);
    await ready(video);
    const { target, reports } = counting();
    await send(target, { type: 'set-rate', rate: 4 });
    await playMuted(video);
    await until(video, () => video.currentTime > 6);
    video.pause();
    await eventsDelivered();
    const watched = video.currentTime;
    expect(reports).toHaveLength(1);
    // Content advanced at 4×: three quarters of it is time not spent. The first update only sets
    // the starting point, so slightly less than the whole position is counted.
    expect(reports[0]).toBeGreaterThan(watched * 0.75 - 1.5);
    expect(reports[0]).toBeLessThanOrEqual(watched * 0.75);
  });

  it('counts nothing when the page set the speed itself', async () => {
    const video = mountMedia({ seconds: 60 });
    await loaded(video);
    await ready(video);
    const { reports } = counting();
    video.playbackRate = 4;
    await playMuted(video);
    await until(video, () => video.currentTime > 4);
    video.pause();
    await eventsDelivered();
    expect(reports).toEqual([]);
  });

  it('never counts a jump as playback', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    await ready(video);
    const { target, reports } = counting();
    await send(target, { type: 'set-rate', rate: 2 });
    await playMuted(video);
    await until(video, () => video.currentTime > 1);
    await send(target, { type: 'seek', seconds: 60 });
    await until(video, () => video.currentTime > 62);
    video.pause();
    await eventsDelivered();
    const total = reports.reduce((sum, seconds) => sum + seconds, 0);
    // About 3 s of content played at 2×: 1.5 s saved, nowhere near the 60 s jumped.
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(3);
  });

  it('never counts even a short jump forward', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    await ready(video);
    const { target, reports } = counting();
    await send(target, { type: 'set-rate', rate: 2 });
    await playMuted(video);
    await until(video, () => video.currentTime > 1);
    for (let jump = 0; jump < 5; jump++) {
      await send(target, { type: 'seek', seconds: 4 });
      await until(video, () => !video.seeking);
    }
    await until(video, () => video.currentTime > 23);
    video.pause();
    await eventsDelivered();
    const total = reports.reduce((sum, seconds) => sum + seconds, 0);
    // About 3 s of content played at 2× (1.5 s saved); counting the jumps would add 10 s.
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(3);
  });

  it('reports what is pending when the engine stops', async () => {
    const video = mountMedia({ seconds: 60 });
    await loaded(video);
    await ready(video);
    const { target, reports } = counting();
    await send(target, { type: 'set-rate', rate: 2 });
    await playMuted(video);
    await until(video, () => video.currentTime > 2);
    target.stop();
    expect(reports).toHaveLength(1);
  });
});
