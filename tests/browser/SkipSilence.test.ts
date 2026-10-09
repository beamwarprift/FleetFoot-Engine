// Skip Silence on a real player, heard through a listener the test drives: each silence rises to
// the silence speed in steps and drops back at once at the first sound; a deliberate change, a
// held key or a change the page makes wins; a player paused, switched off or not heard is put
// back at the user's speed; the state shows the user's speed and what Skip Silence is doing.

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { SILENCE_THRESHOLDS } from '../../src/core/media/SilenceDetector.ts';
import type { ListenEvents, SilenceListen } from '../../src/core/media/SilenceListener.ts';
import { RAMP_SECONDS, RAMP_STEPS } from '../../src/core/media/SilenceSkipper.ts';
import type { EngineState } from '../../src/core/messages/Protocol.ts';
import {
  eventsDelivered,
  loaded,
  mountMedia,
  playMuted,
  resetPage,
  toneUrl,
  until,
} from './media.ts';

const engines: MediaEngine[] = [];

afterEach(() => {
  for (const created of engines.splice(0)) created.stop();
  resetPage();
});

const BLOCK = 0.05;
const LOUD = -20;
const QUIET = -70;
const NORMAL = SILENCE_THRESHOLDS.normal;
const SILENCE_RATE = 5;

/** A listener the test speaks for: it hears whatever the test feeds it. */
function fakeEars() {
  const heard = new Map<HTMLMediaElement, ListenEvents>();
  const released: HTMLMediaElement[] = [];
  const listen: SilenceListen = (media, events) => {
    heard.set(media, events);
    events.status('listening');
    return () => {
      heard.delete(media);
      released.push(media);
    };
  };
  const events = (media: HTMLMediaElement): ListenEvents => {
    const found = heard.get(media);
    if (found === undefined) throw new Error('the player is not heard');
    return found;
  };
  /** Feeds blocks at `db` for `seconds`; returns the player's speed after each block. */
  const feed = (media: HTMLMediaElement, db: number, seconds: number): number[] => {
    const ears = events(media);
    const rates: number[] = [];
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += BLOCK) {
      ears.block(db, BLOCK);
      rates.push(media.playbackRate);
    }
    return rates;
  };
  return {
    listen,
    heard,
    released,
    events,
    sound: (media: HTMLMediaElement, seconds = 0.2) => feed(media, LOUD, seconds),
    /** Quiet long enough for a silence, and for the whole rise. */
    silence: (media: HTMLMediaElement) =>
      feed(media, QUIET, NORMAL.minSilenceSeconds + RAMP_SECONDS + BLOCK),
  };
}

function send(target: MediaEngine, message: Record<string, unknown>) {
  return target.handleMessage({ v: 1, ...message });
}

async function state(target: MediaEngine): Promise<EngineState> {
  return (await send(target, { type: 'get-state' })).state;
}

/** A playing player at the user's speed, an engine hearing it with Skip Silence on. */
async function skipping(rate = 1.5, policy: 'smart' | 'lock' = 'smart') {
  const ears = fakeEars();
  const video = mountMedia();
  await loaded(video);
  const target = createMediaEngine(window, { listen: ears.listen });
  engines.push(target);
  await send(target, { type: 'set-rate-policy', policy });
  await send(target, { type: 'set-rate', rate });
  await playMuted(video);
  await send(target, {
    type: 'set-skip-silence',
    enabled: true,
    mode: 'normal',
    silenceRate: SILENCE_RATE,
  });
  ears.sound(video);
  return { ears, video, target };
}

describe('Skip Silence', () => {
  it('is off by default and hears nothing then', async () => {
    const ears = fakeEars();
    const video = mountMedia();
    await loaded(video);
    const target = createMediaEngine(window, { listen: ears.listen });
    engines.push(target);
    await playMuted(video);
    expect((await state(target)).skipSilence).toEqual({ status: 'off' });
    expect(ears.heard.size).toBe(0);
  });

  it('rises through a silence in steps, drops back at the first sound, and shows the user speed', async () => {
    const { ears, video, target } = await skipping();
    const rates = [...new Set(ears.silence(video))];
    expect(video.playbackRate).toBe(SILENCE_RATE);
    const during = await state(target);
    expect(during.rate).toBe(1.5);
    expect(during.skipSilence).toEqual({ status: 'skipping' });
    // The quiet before the silence, then each step of the rise, the last at the silence speed.
    expect(rates[0]).toBe(1.5);
    const rise = rates.slice(1);
    expect(rise).toHaveLength(RAMP_STEPS);
    for (let step = 1; step < rise.length; step++) {
      expect(rise[step], `step ${step}`).toBeGreaterThan(rise[step - 1] ?? 0);
    }
    expect(rise[0]).toBeGreaterThan(1.5);
    expect(rise.at(-1)).toBe(SILENCE_RATE);
    expect(ears.sound(video, BLOCK)).toEqual([1.5]);
    expect((await state(target)).skipSilence).toEqual({ status: 'listening' });
  });

  it('counts the remaining time at the user speed during a silence', async () => {
    const { ears, video, target } = await skipping(2);
    ears.silence(video);
    const { remaining } = await state(target);
    if (remaining === null || remaining.atRate === null) throw new Error('no remaining time');
    expect(remaining.atRate).toBeCloseTo(remaining.original / 2, 6);
  });

  it('never speeds up a player before anything was heard', async () => {
    const ears = fakeEars();
    const video = mountMedia();
    await loaded(video);
    const target = createMediaEngine(window, { listen: ears.listen });
    engines.push(target);
    await playMuted(video);
    await send(target, {
      type: 'set-skip-silence',
      enabled: true,
      mode: 'normal',
      silenceRate: SILENCE_RATE,
    });
    ears.silence(video);
    ears.silence(video);
    expect(video.playbackRate).toBe(1);
  });

  it('never slows a player down', async () => {
    const { ears, video } = await skipping(6);
    ears.silence(video);
    expect(video.playbackRate).toBe(6);
  });

  it('lets a deliberate change during a silence stand, with no restore at the next sound', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    await send(target, { type: 'set-rate', rate: 2 });
    expect(video.playbackRate).toBe(2);
    expect((await state(target)).skipSilence).toEqual({ status: 'listening' });
    ears.silence(video);
    ears.sound(video);
    expect(video.playbackRate).toBe(2);
    expect((await state(target)).rate).toBe(2);
    expect((await state(target)).previousRate).toBe(1.5);
  });

  it('gives a held key the user speed to start from, and the user speed back when let go', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    await send(target, { type: 'hold-start', rate: 3 });
    expect(video.playbackRate).toBe(3);
    ears.silence(video);
    expect(video.playbackRate).toBe(3);
    await send(target, { type: 'hold-end' });
    expect(video.playbackRate).toBe(1.5);
  });

  it('never skips while a key is held', async () => {
    const { ears, video, target } = await skipping();
    await send(target, { type: 'hold-start', rate: 3 });
    ears.silence(video);
    expect(video.playbackRate).toBe(3);
    await send(target, { type: 'hold-end' });
    expect(video.playbackRate).toBe(1.5);
  });

  it('keeps a silence fast when the page sets a speed, and gives the sound that speed', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    video.playbackRate = 1.25;
    await eventsDelivered();
    expect(video.playbackRate).toBe(SILENCE_RATE);
    expect((await state(target)).rate).toBe(1.25);
    ears.sound(video);
    expect(video.playbackRate).toBe(1.25);
  });

  it('leaves a silence to a page that keeps changing the speed in it', async () => {
    const { ears, video } = await skipping();
    const rates: number[] = [];
    const fight = () => {
      rates.push(video.playbackRate);
      if (video.playbackRate !== 1) video.playbackRate = 1;
    };
    ears.silence(video);
    await eventsDelivered();
    video.addEventListener('ratechange', fight);
    video.playbackRate = 1;
    await eventsDelivered();
    await eventsDelivered();
    video.removeEventListener('ratechange', fight);
    expect(video.playbackRate).toBe(1);
    // One answer from the silence, then it gave way.
    expect(rates.filter((rate) => rate === SILENCE_RATE)).toHaveLength(1);
    ears.sound(video);
    expect(video.playbackRate).toBe(1);
  });

  it('never slows down a page that sets a faster speed during a silence', async () => {
    const { ears, video } = await skipping();
    ears.silence(video);
    video.playbackRate = 8;
    await eventsDelivered();
    expect(video.playbackRate).toBe(8);
    ears.sound(video);
    expect(video.playbackRate).toBe(8);
  });

  it('under LOCK: the policy never fights a silence, and the sound comes back at the user speed', async () => {
    const { ears, video, target } = await skipping(2, 'lock');
    ears.silence(video);
    await eventsDelivered();
    expect(video.playbackRate).toBe(SILENCE_RATE);
    ears.sound(video);
    expect(video.playbackRate).toBe(2);
    ears.silence(video);
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(SILENCE_RATE);
    ears.sound(video);
    await eventsDelivered();
    expect(video.playbackRate).toBe(2);
    expect((await state(target)).rate).toBe(2);
  });

  it('lets go of a paused player at the user speed, and hears it again when it plays', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    video.pause();
    await eventsDelivered();
    expect(video.playbackRate).toBe(1.5);
    expect(ears.released).toContain(video);
    expect(ears.heard.has(video)).toBe(false);
    await video.play();
    await eventsDelivered();
    expect(ears.heard.has(video)).toBe(true);
    expect((await state(target)).skipSilence).toEqual({ status: 'listening' });
  });

  it('puts the user speed back when switched off during a silence', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    await send(target, {
      type: 'set-skip-silence',
      enabled: false,
      mode: 'normal',
      silenceRate: SILENCE_RATE,
    });
    expect(video.playbackRate).toBe(1.5);
    expect(ears.heard.size).toBe(0);
    expect((await state(target)).skipSilence).toEqual({ status: 'off' });
  });

  it('puts the user speed back when the engine stops during a silence', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    target.stop();
    expect(video.playbackRate).toBe(1.5);
    expect(ears.heard.size).toBe(0);
  });

  it('reports a player it may not hear until its source changes, at the user speed', async () => {
    const { ears, video, target } = await skipping();
    ears.silence(video);
    ears.events(video).status('unavailable');
    expect(video.playbackRate).toBe(1.5);
    expect((await state(target)).skipSilence).toEqual({ status: 'unavailable' });
    video.src = toneUrl(60);
    await loaded(video);
    await eventsDelivered();
    expect((await state(target)).skipSilence.status).not.toBe('unavailable');
  });

  it('reports a player waiting for a click before it can be heard', async () => {
    const { ears, video, target } = await skipping();
    ears.events(video).status('waiting');
    expect((await state(target)).skipSilence).toEqual({ status: 'waiting' });
    ears.events(video).status('listening');
    expect((await state(target)).skipSilence).toEqual({ status: 'listening' });
  });

  it('applies a new silence speed and mode from the next silence', async () => {
    const { ears, video, target } = await skipping();
    await send(target, {
      type: 'set-skip-silence',
      enabled: true,
      mode: 'aggressive',
      silenceRate: 3,
    });
    ears.sound(video);
    ears.silence(video);
    expect(video.playbackRate).toBe(3);
  });

  it('counts the time a silence saved', async () => {
    const ears = fakeEars();
    const saved: number[] = [];
    const video = mountMedia();
    await loaded(video);
    const target = createMediaEngine(window, {
      listen: ears.listen,
      onTimeSaved: (seconds) => saved.push(seconds),
    });
    engines.push(target);
    await playMuted(video);
    await send(target, {
      type: 'set-skip-silence',
      enabled: true,
      mode: 'normal',
      silenceRate: SILENCE_RATE,
    });
    ears.sound(video);
    ears.silence(video);
    const start = video.currentTime;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (video.currentTime - start < 2) return;
        video.removeEventListener('timeupdate', check);
        resolve();
      };
      video.addEventListener('timeupdate', check);
    });
    video.pause();
    await eventsDelivered();
    expect(saved.reduce((sum, seconds) => sum + seconds, 0)).toBeGreaterThan(0.5);
  });
});

describe('Skip Silence hearing a real player', () => {
  it('speeds up the silences of a recording and gives the sound its speed back', async () => {
    const audio = mountMedia({ kind: 'audio', seconds: 30, pattern: { sound: 1, silence: 1.5 } });
    await loaded(audio);
    const target = createMediaEngine(window);
    engines.push(target);
    await send(target, {
      type: 'set-skip-silence',
      enabled: true,
      mode: 'normal',
      silenceRate: SILENCE_RATE,
    });
    // Where the browser hears through an audio context, it starts one only after a click.
    await userEvent.click(document.body);
    const rates: number[] = [];
    audio.addEventListener('ratechange', () => rates.push(audio.playbackRate));
    await playMuted(audio);
    await until(audio, () => rates.includes(SILENCE_RATE) && audio.playbackRate === 1, 10_000);
    // The silence started after its minimum: the first second of sound and a part of the quiet
    // played at the user's speed.
    const { state } = await send(target, { type: 'get-state' });
    expect(state.rate).toBe(1);
    expect(state.skipSilence.status).toBe('listening');
    expect(audio.currentTime).toBeGreaterThan(1 + NORMAL.minSilenceSeconds);
  });
});
