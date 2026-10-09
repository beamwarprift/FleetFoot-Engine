// Advanced playback on real media: open Shadow DOM, same-origin iframes, apply-to-all,
// FOLLOW / SMART / LOCK, A–B loop, SPA-style navigation.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import type { Response } from '../../src/core/messages/Protocol.ts';
import {
  eventsDelivered,
  loaded,
  mountMedia,
  mutationsDelivered,
  playMuted,
  ready,
  resetPage,
  seekSettled,
  seekTo,
  toneUrl,
  track,
  until,
} from './media.ts';

const engines: MediaEngine[] = [];
const frames: HTMLIFrameElement[] = [];

function engine(target: Window = window): MediaEngine {
  const created = createMediaEngine(target);
  engines.push(created);
  return created;
}

afterEach(() => {
  for (const created of engines.splice(0)) created.stop();
  for (const frame of frames.splice(0)) frame.remove();
  resetPage();
});

type Send = (message: Record<string, unknown>) => Promise<Response>;

function sender(target: MediaEngine): Send {
  return (message) => target.handleMessage({ v: 1, ...message });
}

async function changeSource(media: HTMLMediaElement): Promise<void> {
  media.src = toneUrl(90);
  await new Promise<void>((resolve) =>
    media.addEventListener('loadedmetadata', () => resolve(), { once: true }),
  );
  await eventsDelivered();
}

function shadowHost(parent: Node = document.body): ShadowRoot {
  const host = document.createElement('div');
  parent.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('open Shadow DOM', () => {
  it('finds media inside open shadow roots, nested ones included', async () => {
    const outer = shadowHost();
    const inner = shadowHost(outer);
    const shallow = mountMedia({ parent: outer as unknown as HTMLElement });
    const deep = mountMedia({ kind: 'audio', parent: inner as unknown as HTMLElement });
    await Promise.all([loaded(shallow), loaded(deep)]);
    const state = (await sender(engine())({ type: 'get-state' })).state;
    expect(state.players.map((player) => player.kind).sort()).toEqual(['audio', 'video']);
  });

  it('sees media added later inside an existing shadow root, and a new host with media', async () => {
    const root = shadowHost();
    const send = sender(engine());
    const inRoot = mountMedia({ parent: root as unknown as HTMLElement });
    const host = document.createElement('div');
    const late = host.attachShadow({ mode: 'open' });
    const inNewHost = mountMedia({ kind: 'audio', parent: late as unknown as HTMLElement });
    document.body.append(host);
    await Promise.all([loaded(inRoot), loaded(inNewHost), mutationsDelivered()]);
    expect((await send({ type: 'get-state' })).state.players).toHaveLength(2);
  });

  it('drops media when their shadow host leaves the page', async () => {
    const root = shadowHost();
    const media = mountMedia({ parent: root as unknown as HTMLElement });
    await loaded(media);
    const send = sender(engine());
    expect((await send({ type: 'get-state' })).state.players).toHaveLength(1);
    root.host.remove();
    await mutationsDelivered();
    expect((await send({ type: 'get-state' })).state.players).toHaveLength(0);
  });

  it('stops watching a shadow root once its host has left the page', async () => {
    const root = shadowHost();
    const send = sender(engine());
    root.host.remove();
    await mutationsDelivered();
    mountMedia({ parent: root as unknown as HTMLElement });
    await mutationsDelivered();
    expect((await send({ type: 'get-state' })).state.players).toHaveLength(0);
  });

  it('controls a player under an overlay inside a shadow root', async () => {
    const root = shadowHost();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:320px;height:180px';
    root.append(wrapper);
    const covered = mountMedia({ width: 320, height: 180, parent: wrapper });
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0';
    wrapper.append(overlay);
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(covered), loaded(large)]);
    const send = sender(engine());
    const rect = overlay.getBoundingClientRect();
    // Dispatched on the host, as a page event outside the shadow tree would be seen.
    root.host.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await send({ type: 'set-rate', rate: 2.5 });
    expect(covered.playbackRate).toBe(2.5);
    expect(large.playbackRate).toBe(1);
  });
});

describe('pointer under nested shadow roots', () => {
  /** Counts shadow-root hit tests; throws past `limit` so a runaway search fails fast. */
  function countShadowHitTests(limit: number): { calls: () => number; restore: () => void } {
    const original = ShadowRoot.prototype.elementsFromPoint;
    let calls = 0;
    ShadowRoot.prototype.elementsFromPoint = function (x: number, y: number) {
      calls += 1;
      if (calls > limit) throw new Error('shadow hit tests did not stop');
      return original.call(this, x, y);
    };
    return {
      calls: () => calls,
      restore: () => (ShadowRoot.prototype.elementsFromPoint = original),
    };
  }

  function pointerDownAt(target: Element, rect: DOMRect): void {
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  }

  it('hit-tests each shadow root once when no media is below the pointer', () => {
    const outer = shadowHost();
    const inner = shadowHost(outer);
    const button = document.createElement('button');
    button.style.cssText = 'width:200px;height:100px';
    inner.append(button);
    engine();
    const probe = countShadowHitTests(50);
    try {
      pointerDownAt(outer.host, button.getBoundingClientRect());
    } finally {
      probe.restore();
    }
    expect(probe.calls()).toBe(2);
  });

  it('controls a player under an overlay two shadow roots deep', async () => {
    const outer = shadowHost();
    const inner = shadowHost(outer);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:320px;height:180px';
    inner.append(wrapper);
    const covered = mountMedia({ width: 320, height: 180, parent: wrapper });
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0';
    wrapper.append(overlay);
    const large = mountMedia({ width: 960, height: 540 });
    await Promise.all([loaded(covered), loaded(large)]);
    const send = sender(engine());
    pointerDownAt(outer.host, overlay.getBoundingClientRect());
    await send({ type: 'set-rate', rate: 2.5 });
    expect(covered.playbackRate).toBe(2.5);
    expect(large.playbackRate).toBe(1);
  });
});

describe('same-origin iframe', () => {
  it('runs one engine per document, controlling only its own media', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:800px;height:500px';
    frames.push(frame);
    // The initial about:blank document exists as soon as the frame is inserted.
    document.body.append(frame);
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (frameWindow === null || frameDocument === null) throw new Error('no iframe document');

    // Created by the frame's document: a node of another realm than the test's.
    const inFrame = track(frameDocument.createElement('video'));
    inFrame.src = toneUrl(120);
    inFrame.style.cssText = 'display:block;width:640px;height:360px';
    frameDocument.body.append(inFrame);
    const onTop = mountMedia();
    await Promise.all([loaded(inFrame), loaded(onTop)]);

    const frameSend = sender(engine(frameWindow));
    expect(inFrame instanceof HTMLMediaElement).toBe(false);
    expect((await frameSend({ type: 'set-rate', rate: 1.75 })).ok).toBe(true);
    expect(inFrame.playbackRate).toBe(1.75);
    expect(onTop.playbackRate).toBe(1);
    expect((await frameSend({ type: 'get-state' })).state.players).toHaveLength(1);
  });
});

describe('apply to all players', () => {
  it('applies rate changes to every player and seeks only the active one', async () => {
    const first = mountMedia({ width: 960, height: 540 });
    const second = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(first), loaded(second)]);
    const send = sender(engine());
    expect((await send({ type: 'set-target', target: 'all' })).state.target).toBe('all');
    await send({ type: 'set-rate', rate: 1.5 });
    expect([first.playbackRate, second.playbackRate]).toEqual([1.5, 1.5]);
    await send({ type: 'adjust-rate', delta: 0.25 });
    expect([first.playbackRate, second.playbackRate]).toEqual([1.75, 1.75]);

    first.currentTime = 20;
    second.currentTime = 20;
    await send({ type: 'seek', seconds: 10 });
    expect(first.currentTime).toBeCloseTo(30, 1);
    expect(second.currentTime).toBeCloseTo(20, 1);
  });

  it('holds every player and restores each to its own rate', async () => {
    const first = mountMedia({ width: 960, height: 540 });
    const second = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(first), loaded(second)]);
    second.playbackRate = 1.25;
    const send = sender(engine());
    await send({ type: 'set-target', target: 'all' });
    await send({ type: 'hold-start', rate: 3 });
    expect([first.playbackRate, second.playbackRate]).toEqual([3, 3]);
    await send({ type: 'hold-end' });
    expect([first.playbackRate, second.playbackRate]).toEqual([1, 1.25]);
  });

  it('returns to the active player only', async () => {
    const first = mountMedia({ width: 960, height: 540 });
    const second = mountMedia({ width: 320, height: 180 });
    await Promise.all([loaded(first), loaded(second)]);
    const send = sender(engine());
    await send({ type: 'set-target', target: 'all' });
    await send({ type: 'set-target', target: 'active' });
    await send({ type: 'set-rate', rate: 2 });
    expect([first.playbackRate, second.playbackRate]).toEqual([2, 1]);
  });
});

describe('rate policy', () => {
  it('starts in SMART', async () => {
    expect((await sender(engine())({ type: 'get-state' })).state.ratePolicy).toBe('smart');
  });

  it('FOLLOW leaves the site free: a new source falls back to 1× (the browser resets it)', async () => {
    const video = mountMedia();
    await loaded(video);
    const send = sender(engine());
    await send({ type: 'set-rate-policy', policy: 'follow' });
    await send({ type: 'set-rate', rate: 2 });
    await changeSource(video);
    expect(video.playbackRate).toBe(1);
  });

  it('SMART re-applies the chosen rate when the same player loads a new source', async () => {
    const video = mountMedia();
    await loaded(video);
    const send = sender(engine());
    await send({ type: 'set-rate', rate: 2 });
    await changeSource(video);
    expect(video.playbackRate).toBe(2);
  });

  it('SMART gives the chosen rate to the player that replaces the current one', async () => {
    const first = mountMedia();
    await loaded(first);
    const send = sender(engine());
    await send({ type: 'set-rate', rate: 1.75 });
    first.remove();
    const replacement = mountMedia();
    await Promise.all([loaded(replacement), mutationsDelivered()]);
    await eventsDelivered();
    expect(replacement.playbackRate).toBe(1.75);
    expect((await send({ type: 'get-state' })).state.desiredRate).toBe(1.75);
  });

  it('FOLLOW does not touch a replacing player', async () => {
    const first = mountMedia();
    await loaded(first);
    const send = sender(engine());
    await send({ type: 'set-rate-policy', policy: 'follow' });
    await send({ type: 'set-rate', rate: 1.75 });
    first.remove();
    const replacement = mountMedia();
    await Promise.all([loaded(replacement), mutationsDelivered()]);
    await eventsDelivered();
    expect(replacement.playbackRate).toBe(1);
  });

  it('SMART does not fight the site', async () => {
    const video = mountMedia();
    await loaded(video);
    await sender(engine())({ type: 'set-rate', rate: 2 });
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(1);
  });

  it('LOCK restores the chosen rate whenever the site changes it', async () => {
    const video = mountMedia();
    await loaded(video);
    const send = sender(engine());
    await send({ type: 'set-rate-policy', policy: 'lock' });
    await send({ type: 'set-rate', rate: 2 });
    for (const forced of [1, 0.5, 1, 1.25, 1]) {
      video.playbackRate = forced;
      await eventsDelivered();
      expect(video.playbackRate).toBe(2);
    }
  });

  it('switching to LOCK restores at once a rate the site changed before', async () => {
    const video = mountMedia();
    const untouched = mountMedia({ width: 160, height: 90 });
    await Promise.all([loaded(video), loaded(untouched)]);
    const send = sender(engine());
    await send({ type: 'set-rate', rate: 2 });
    untouched.playbackRate = 1.5;
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(1);
    await send({ type: 'set-rate-policy', policy: 'lock' });
    expect(video.playbackRate).toBe(2);
    expect(untouched.playbackRate).toBe(1.5);
  });

  it('LOCK lets a hold through and locks again after it', async () => {
    const video = mountMedia();
    await loaded(video);
    const send = sender(engine());
    await send({ type: 'set-rate-policy', policy: 'lock' });
    await send({ type: 'set-rate', rate: 2 });
    await send({ type: 'hold-start', rate: 3 });
    await eventsDelivered();
    expect(video.playbackRate).toBe(3);
    await send({ type: 'hold-end' });
    await eventsDelivered();
    expect(video.playbackRate).toBe(2);
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(2);
  });

  it('LOCK leaves players the user never targeted alone', async () => {
    const main = mountMedia({ width: 960, height: 540 });
    await loaded(main);
    const send = sender(engine());
    await send({ type: 'set-rate-policy', policy: 'lock' });
    await send({ type: 'set-rate', rate: 2 });
    const other = mountMedia({ width: 160, height: 90 });
    await Promise.all([loaded(other), mutationsDelivered()]);
    other.playbackRate = 1.5;
    await eventsDelivered();
    expect(other.playbackRate).toBe(1.5);
  });
});

describe('A–B loop', () => {
  it('jumps back to A when playback reaches B', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    await ready(video);
    const send = sender(engine());
    await seekTo(video, 10);
    await send({ type: 'loop-set-a' });
    await seekTo(video, 11);
    await send({ type: 'loop-set-b' });
    expect((await send({ type: 'loop-enable', enabled: true })).state.loop).toMatchObject({
      a: 10,
      b: 11,
      enabled: true,
    });
    expect(video.currentTime).toBeCloseTo(10, 1);
    await seekSettled(video);
    await send({ type: 'set-rate', rate: 4 });
    // Playing forward from A never seeks by itself: a seek back to A is the loop at work.
    const jumped = until(video, () => video.seeking && video.currentTime < 10.5);
    await playMuted(video);
    await jumped;
    expect(video.currentTime).toBeCloseTo(10, 0);
  });

  it('enforces A ≥ 0, B > A and a finite duration', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    const send = sender(engine());
    expect(await send({ type: 'loop-enable', enabled: true })).toMatchObject({
      error: 'loop-invalid',
    });
    video.currentTime = 30;
    await send({ type: 'loop-set-a' });
    video.currentTime = 20;
    expect(await send({ type: 'loop-set-b' })).toMatchObject({ ok: false, error: 'loop-invalid' });
    expect((await send({ type: 'get-state' })).state.loop).toEqual({
      a: 30,
      b: null,
      enabled: false,
    });
    video.currentTime = 40;
    await send({ type: 'loop-set-b' });
    video.currentTime = 45;
    expect(await send({ type: 'loop-set-a' })).toMatchObject({ ok: false, error: 'loop-invalid' });
    expect((await send({ type: 'get-state' })).state.loop).toEqual({
      a: 30,
      b: 40,
      enabled: false,
    });
  });

  it('lets B alone loop from the start, and clears', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    const send = sender(engine());
    video.currentTime = 5;
    await send({ type: 'loop-set-b' });
    video.currentTime = 50;
    await send({ type: 'loop-enable', enabled: true });
    expect(video.currentTime).toBe(0);
    expect((await send({ type: 'loop-clear' })).state.loop).toBeNull();
  });

  it('stops looping when disabled', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    await ready(video);
    const send = sender(engine());
    await seekTo(video, 10);
    await send({ type: 'loop-set-a' });
    await seekTo(video, 10.5);
    await send({ type: 'loop-set-b' });
    await send({ type: 'loop-enable', enabled: true });
    await seekSettled(video);
    await send({ type: 'loop-enable', enabled: false });
    await send({ type: 'set-rate', rate: 4 });
    await playMuted(video);
    await until(video, () => video.currentTime > 11.5);
    expect((await send({ type: 'get-state' })).state.loop?.enabled).toBe(false);
  });

  it('drops the markers when the same element loads another source', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    const send = sender(engine());
    video.currentTime = 10;
    await send({ type: 'loop-set-a' });
    video.currentTime = 20;
    await send({ type: 'loop-set-b' });
    await changeSource(video);
    expect((await send({ type: 'get-state' })).state.loop).toBeNull();
  });

  it('never moves markers to a replacing element', async () => {
    const first = mountMedia({ seconds: 120 });
    await loaded(first);
    const send = sender(engine());
    first.currentTime = 10;
    await send({ type: 'loop-set-b' });
    first.remove();
    const replacement = mountMedia({ seconds: 120 });
    await Promise.all([loaded(replacement), mutationsDelivered()]);
    expect((await send({ type: 'get-state' })).state.loop).toBeNull();
  });

  it('refuses a live stream', async () => {
    const canvas = document.createElement('canvas');
    canvas.getContext('2d')?.fillRect(0, 0, 10, 10);
    const live = track(document.createElement('video'));
    live.style.cssText = 'display:block;width:640px;height:360px';
    live.muted = true;
    live.srcObject = canvas.captureStream(5);
    document.body.append(live);
    await loaded(live);
    expect(await sender(engine())({ type: 'loop-set-a' })).toMatchObject({
      ok: false,
      error: 'not-loopable',
    });
  });
});

describe('SPA navigation', () => {
  it('keeps working across history navigation and gives the new player the chosen rate', async () => {
    const page = document.createElement('main');
    document.body.append(page);
    const first = mountMedia({ parent: page });
    await loaded(first);
    const send = sender(engine());
    await send({ type: 'set-rate', rate: 2.25 });

    const before = location.href;
    history.pushState({}, '', '#next-video');
    page.replaceChildren();
    const next = mountMedia({ parent: page });
    await Promise.all([loaded(next), mutationsDelivered()]);
    await eventsDelivered();
    expect(next.playbackRate).toBe(2.25);
    history.replaceState({}, '', before);
  });
});

describe('engine stop', () => {
  it('restores held players and stops enforcing the rate', async () => {
    const video = mountMedia();
    await loaded(video);
    const running = engine();
    const send = sender(running);
    await send({ type: 'set-rate-policy', policy: 'lock' });
    await send({ type: 'set-rate', rate: 2 });
    await send({ type: 'hold-start', rate: 3 });
    running.stop();
    expect(video.playbackRate).toBe(2);
    await eventsDelivered();
    video.playbackRate = 1;
    await eventsDelivered();
    expect(video.playbackRate).toBe(1);
  });

  it('stops every A–B loop', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    await ready(video);
    const running = engine();
    const send = sender(running);
    await seekTo(video, 10);
    await send({ type: 'loop-set-a' });
    await seekTo(video, 11);
    await send({ type: 'loop-set-b' });
    await send({ type: 'loop-enable', enabled: true });
    await seekSettled(video);
    running.stop();
    video.playbackRate = 2;
    await playMuted(video);
    // Two seconds past B: a loop still checking on timeupdate (at most 250 ms apart, 0.5 s of
    // media at 2×) would have pulled playback back to A long before.
    await until(video, () => video.currentTime > 13);
  });
});
