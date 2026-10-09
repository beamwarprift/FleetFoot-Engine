// LOCK against a page that answers every restore at once, for each answer the user can choose:
// with a brake or without, the page stops seeing the engine's own changes and the speed holds;
// a page that catches the event before the engine is restored at a bounded rate, or unbounded.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { BRAKE_INTERVAL_MS, CONTEST_LIMIT } from '../../src/core/media/RatePolicy.ts';
import type { EngineState, LockFight } from '../../src/core/messages/Protocol.ts';
import { eventsDelivered, loaded, mountMedia, resetPage } from './media.ts';

const engines: MediaEngine[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const created of engines.splice(0)) created.stop();
  resetPage();
});

function send(target: MediaEngine, message: Record<string, unknown>) {
  return target.handleMessage({ v: 1, ...message });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An engine on LOCK at 2×, with `fight` as its answer. */
async function locked(video: HTMLMediaElement, fight: LockFight): Promise<MediaEngine> {
  await loaded(video);
  const target = createMediaEngine(window);
  engines.push(target);
  await send(target, { type: 'set-rate-policy', policy: 'lock' });
  await send(target, { type: 'set-lock-fight', fight });
  await send(target, { type: 'set-rate', rate: 2 });
  return target;
}

/** A player that puts 1× back the moment it hears of any other speed, until told to stop. */
function fighter(on: EventTarget, video: HTMLMediaElement, capture = false) {
  const page = { fighting: true, heard: [] as number[] };
  const listener = () => {
    page.heard.push(video.playbackRate);
    if (page.fighting && video.playbackRate !== 1) video.playbackRate = 1;
  };
  on.addEventListener('ratechange', listener, capture);
  cleanups.push(() => on.removeEventListener('ratechange', listener, capture));
  return page;
}

describe.each(['braked', 'unbraked'] as const)(
  'LOCK %s against a page that answers at once',
  (fight) => {
    it('keeps the speed: the page stops hearing of it, and nothing is reported as yielded', async () => {
      const video = mountMedia();
      const target = await locked(video, fight);
      const page = fighter(video, video);
      video.playbackRate = 1;
      await eventsDelivered();
      await eventsDelivered();
      expect(video.playbackRate).toBe(2);
      const heard = page.heard.length;
      // The fight lasted the few answers LOCK takes to tell a fight from a reset.
      expect(heard).toBeLessThanOrEqual(2 * (CONTEST_LIMIT + 2));
      await eventsDelivered();
      expect(page.heard.length).toBe(heard);
      const { state } = await send(target, { type: 'get-state' });
      expect(state.rate).toBe(2);
      expect(state.rateContested).toBe(false);
    });

    it("still lets the page hear its own changes, never the engine's answer", async () => {
      const video = mountMedia();
      await locked(video, fight);
      const page = fighter(video, video);
      video.playbackRate = 1;
      await eventsDelivered();
      await eventsDelivered();
      page.fighting = false;
      page.heard.length = 0;
      video.playbackRate = 0.5;
      await eventsDelivered();
      expect(page.heard).toEqual([0.5]);
      expect(video.playbackRate).toBe(2);
    });

    it('hides its changes inside an open shadow root too', async () => {
      const host = document.createElement('div');
      document.body.append(host);
      cleanups.push(() => host.remove());
      const inner = document.createElement('div');
      host.attachShadow({ mode: 'open' }).append(inner);
      const video = mountMedia({ parent: inner });
      await locked(video, fight);
      const page = fighter(video, video);
      video.playbackRate = 1;
      await eventsDelivered();
      await eventsDelivered();
      const heard = page.heard.length;
      await eventsDelivered();
      expect(page.heard.length).toBe(heard);
      expect(video.playbackRate).toBe(2);
    });

    it('lets the page hear everything again once LOCK yields or is left', async () => {
      const video = mountMedia();
      const target = await locked(video, fight);
      const page = fighter(video, video);
      video.playbackRate = 1;
      await eventsDelivered();
      await eventsDelivered();
      page.fighting = false;
      await send(target, { type: 'set-rate-policy', policy: 'smart' });
      page.heard.length = 0;
      await send(target, { type: 'set-rate', rate: 1.5 });
      await eventsDelivered();
      expect(page.heard).toEqual([1.5]);

      await send(target, { type: 'set-rate-policy', policy: 'lock' });
      await send(target, { type: 'set-lock-fight', fight: 'yield' });
      page.fighting = true;
      video.playbackRate = 1;
      await eventsDelivered();
      await eventsDelivered();
      expect(page.heard).toContain(1.5);
      expect(video.playbackRate).toBe(1);
      expect((await send(target, { type: 'get-state' })).state.rateContested).toBe(true);
    });
  },
);

describe('LOCK against a page that hears the event before the engine', () => {
  /** Restores the page saw in `ms` of fighting, after the engine took up the fight. */
  async function restoresIn(fight: LockFight, ms: number) {
    const video = mountMedia();
    await loaded(video);
    // Registered before the engine exists, on the first node of the path: it runs first.
    const page = fighter(window, video, true);
    page.fighting = false;
    await locked(video, fight);
    page.heard.length = 0;
    page.fighting = true;
    const start = performance.now();
    video.playbackRate = 1;
    await wait(ms);
    page.fighting = false;
    const elapsed = performance.now() - start;
    await eventsDelivered();
    return { restores: page.heard.filter((rate) => rate === 2).length, elapsed, video };
  }

  it('with a brake: keeps restoring, never more often than the bound', async () => {
    const { restores, elapsed, video } = await restoresIn('braked', 300);
    expect(restores).toBeGreaterThan(CONTEST_LIMIT + 5);
    expect(restores).toBeLessThanOrEqual(
      CONTEST_LIMIT + 2 + Math.ceil(elapsed / BRAKE_INTERVAL_MS),
    );
    expect(video.playbackRate).toBe(2);
  });

  it('without a brake: restores at every answer, far beyond that bound', async () => {
    const { restores, elapsed } = await restoresIn('unbraked', 100);
    expect(restores).toBeGreaterThan(3 * Math.ceil(elapsed / BRAKE_INTERVAL_MS));
  });
});

describe('a restore the page never hears of', () => {
  /** On LOCK with a brake, after a fight the engine won: the page is quiet, the shield is up. */
  async function won() {
    const video = mountMedia();
    const target = await locked(video, 'braked');
    const page = fighter(video, video);
    video.playbackRate = 1;
    await eventsDelivered();
    await eventsDelivered();
    page.fighting = false;
    return { video, target };
  }

  it('still reaches whoever shows the state', async () => {
    const { video, target } = await won();
    const states: EngineState[] = [];
    const pushed = new Promise<void>((resolve) => {
      const stop = target.subscribe(
        (state) => {
          states.push(state);
          if (state.rate === 2 && states.some((earlier) => earlier.rate === 0.5)) resolve();
        },
        { time: false },
      );
      cleanups.push(stop);
    });
    // Both changes land before their events: the state shows 0.5, and only the hidden restore
    // brings 2 back.
    video.playbackRate = 1;
    video.playbackRate = 0.5;
    await pushed;
    expect(video.playbackRate).toBe(2);
  });

  it('is dropped when the engine stops before it', async () => {
    const { video, target } = await won();
    // After the engine's own listener, which has just put the restore on hold.
    const stopOnce = () => target.stop();
    video.addEventListener('ratechange', stopOnce, { once: true });
    video.playbackRate = 1;
    await eventsDelivered();
    await wait(4 * BRAKE_INTERVAL_MS);
    expect(video.playbackRate).toBe(1);
  });
});

describe('the shield hides only what the engine wrote', () => {
  /** On LOCK with a brake, after a fight the engine won: the page is quiet, the shield is up. */
  async function shielded() {
    const video = mountMedia();
    const target = await locked(video, 'braked');
    const page = fighter(video, video);
    video.playbackRate = 1;
    await eventsDelivered();
    await eventsDelivered();
    page.fighting = false;
    page.heard.length = 0;
    return { video, target, page };
  }

  it('lets the page hear a change it made before the event of ours arrived', async () => {
    const { video, target, page } = await shielded();
    await send(target, { type: 'set-rate', rate: 1.5 });
    video.playbackRate = 0.5;
    await eventsDelivered();
    // Two events, both reading the page's own speed: neither is ours to hide.
    expect(page.heard).toEqual([0.5, 0.5]);
  });

  it('expects no event from a write that changed nothing', async () => {
    const { video, target, page } = await shielded();
    await send(target, { type: 'set-rate', rate: 2 });
    video.playbackRate = 1;
    video.playbackRate = 2;
    await eventsDelivered();
    expect(page.heard).toEqual([2, 2]);
  });

  it('stops hiding once the engine stops', async () => {
    const { target, page } = await shielded();
    await send(target, { type: 'set-rate', rate: 2.5 });
    target.stop();
    await eventsDelivered();
    expect(page.heard).toContain(2.5);
  });

  it('drops a waiting restore when the policy changes', async () => {
    const { video, target } = await shielded();
    // After the engine's own listener, which has just put the restore on hold.
    const leave = () => void send(target, { type: 'set-rate-policy', policy: 'smart' });
    video.addEventListener('ratechange', leave, { once: true });
    video.playbackRate = 1;
    await eventsDelivered();
    await wait(4 * BRAKE_INTERVAL_MS);
    expect(video.playbackRate).toBe(1);
  });
});
