// No permanent timer while the extension is idle, and nothing left once it stops. A
// ledger records every timer, frame callback, listener and observer the engine and its page
// session create, from the moment they start: at rest none of the timers is waiting, and after
// `stop()` none of the rest is alive.

import { afterEach, describe, expect, it } from 'vitest';
import { createMediaEngine } from '../../src/core/MediaEngine.ts';
import { HIDE_AFTER_MS } from '../../src/page/overlay/Overlay.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import { eventsDelivered, loaded, mountMedia, resetPage } from './media.ts';
import { ENGLISH, memoryProfiles, memorySettings } from './ui.ts';

interface Listening {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: unknown;
  readonly capture: boolean;
}

/** What is alive now, among what was created since `record()`. */
interface Ledger {
  readonly timers: Set<number>;
  readonly intervals: Set<number>;
  readonly frames: Set<number>;
  readonly listeners: Listening[];
  readonly observers: Set<MutationObserver | ResizeObserver>;
  stop(): void;
}

function record(): Ledger {
  const ledger = {
    timers: new Set<number>(),
    intervals: new Set<number>(),
    frames: new Set<number>(),
    listeners: [] as Listening[],
    observers: new Set<MutationObserver | ResizeObserver>(),
  };
  const restore: Array<() => void> = [];
  const swap = <T extends object, K extends keyof T>(owner: T, key: K, value: T[K]) => {
    const original = owner[key];
    owner[key] = value;
    restore.push(() => {
      owner[key] = original;
    });
    return original;
  };

  const setTimeoutOriginal = window.setTimeout.bind(window);
  const clearTimeoutOriginal = window.clearTimeout.bind(window);
  swap(window, 'setTimeout', ((run: () => void, ms?: number) => {
    const id: number = setTimeoutOriginal(() => {
      ledger.timers.delete(id);
      run();
    }, ms);
    ledger.timers.add(id);
    return id;
  }) as typeof window.setTimeout);
  swap(window, 'clearTimeout', ((id?: number) => {
    if (id !== undefined) ledger.timers.delete(id);
    clearTimeoutOriginal(id);
  }) as typeof window.clearTimeout);
  const setIntervalOriginal = window.setInterval.bind(window);
  const clearIntervalOriginal = window.clearInterval.bind(window);
  swap(window, 'setInterval', ((run: () => void, ms?: number) => {
    const id: number = setIntervalOriginal(run, ms);
    ledger.intervals.add(id);
    return id;
  }) as typeof window.setInterval);
  swap(window, 'clearInterval', ((id?: number) => {
    if (id !== undefined) ledger.intervals.delete(id);
    clearIntervalOriginal(id);
  }) as typeof window.clearInterval);
  const frameOriginal = window.requestAnimationFrame.bind(window);
  const cancelFrameOriginal = window.cancelAnimationFrame.bind(window);
  swap(window, 'requestAnimationFrame', (run: FrameRequestCallback) => {
    const id = frameOriginal((time) => {
      ledger.frames.delete(id);
      run(time);
    });
    ledger.frames.add(id);
    return id;
  });
  swap(window, 'cancelAnimationFrame', (id: number) => {
    ledger.frames.delete(id);
    cancelFrameOriginal(id);
  });

  const captureOf = (options?: boolean | EventListenerOptions) =>
    typeof options === 'boolean' ? options : options?.capture === true;
  const forget = (entry: Listening) => {
    const index = ledger.listeners.indexOf(entry);
    if (index >= 0) ledger.listeners.splice(index, 1);
  };
  const plainAdd = EventTarget.prototype.addEventListener;
  // The window may carry methods of its own (the test runner wraps them): both are followed.
  const owners: Array<Pick<EventTarget, 'addEventListener' | 'removeEventListener'>> = [
    EventTarget.prototype,
  ];
  if (window.addEventListener !== EventTarget.prototype.addEventListener) owners.push(window);
  for (const owner of owners) {
    const add = owner.addEventListener;
    const remove = owner.removeEventListener;
    swap(owner, 'addEventListener', function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      add.call(this, type, listener, options);
      if (listener === null) return;
      const entry = { target: this, type, listener, capture: captureOf(options) };
      const signal = typeof options === 'object' ? options.signal : undefined;
      if (signal?.aborted === true) return;
      ledger.listeners.push(entry);
      if (signal !== undefined) {
        plainAdd.call(signal, 'abort', () => forget(entry), { once: true });
      }
    } as typeof owner.addEventListener);
    swap(owner, 'removeEventListener', function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      remove.call(this, type, listener, options);
      const entry = ledger.listeners.find(
        (item) =>
          item.target === this &&
          item.type === type &&
          item.listener === listener &&
          item.capture === captureOf(options),
      );
      if (entry !== undefined) forget(entry);
    } as typeof owner.removeEventListener);
  }

  for (const Observer of [MutationObserver, ResizeObserver] as const) {
    const observe = Observer.prototype.observe;
    const disconnect = Observer.prototype.disconnect;
    swap(Observer.prototype, 'observe', function (
      this: MutationObserver & ResizeObserver,
      ...args: [never, never?]
    ) {
      ledger.observers.add(this);
      return (observe as (...rest: unknown[]) => void).apply(this, args);
    } as never);
    swap(Observer.prototype, 'disconnect', function (this: MutationObserver & ResizeObserver) {
      ledger.observers.delete(this);
      return disconnect.call(this);
    } as never);
  }

  return {
    ...ledger,
    stop() {
      for (const undo of restore.splice(0).reverse()) undo();
    },
  };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What a person does on a page: hovers the player, changes the speed, opens the popup. */
async function used(video: HTMLMediaElement) {
  const engine = createMediaEngine(window);
  const stopSession = await startPageSession({
    window,
    engine,
    settings: memorySettings({ ratePolicy: 'lock', lockFight: 'braked' }),
    profiles: memoryProfiles(),
    l10n: ENGLISH,
  });
  const rect = video.getBoundingClientRect();
  window.dispatchEvent(
    new PointerEvent('pointermove', { clientX: rect.left + 20, clientY: rect.top + 20 }),
  );
  await engine.handleMessage({ v: 1, type: 'set-rate', rate: 2 });
  const unsubscribe = engine.subscribe(() => {}, { time: true });
  await engine.handleMessage({ v: 1, type: 'loop-set-a' });
  // A page that fights LOCK, until the shield is up and it gives up.
  const fight = () => {
    if (video.playbackRate !== 1) video.playbackRate = 1;
  };
  video.addEventListener('ratechange', fight);
  video.playbackRate = 1;
  await eventsDelivered();
  await eventsDelivered();
  video.removeEventListener('ratechange', fight);
  const { state } = await engine.handleMessage({ v: 1, type: 'get-state' });
  expect([state.ratePolicy, state.rate, state.rateContested]).toEqual(['lock', 2, false]);
  unsubscribe();
  // The pointer leaves; the overlay's one timer runs out.
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 4000, clientY: 4000 }));
  await wait(HIDE_AFTER_MS + 200);
  return { engine, stopSession };
}

describe('idle and stopped', () => {
  it('waits on no timer at rest, after a hover, a speed change, a popup and a fight', async () => {
    const video = mountMedia();
    await loaded(video);
    const ledger = record();
    cleanups.push(() => ledger.stop());
    const { engine, stopSession } = await used(video);
    cleanups.push(() => {
      stopSession();
      engine.stop();
    });
    expect(ledger.intervals.size).toBe(0);
    expect(ledger.timers.size).toBe(0);
    expect(ledger.frames.size).toBe(0);
    // Something was recorded: the ledger saw the engine at work.
    expect(ledger.listeners.length).toBeGreaterThan(0);
    expect(ledger.observers.size).toBeGreaterThan(0);
  });

  it('leaves no listener, observer, timer or frame callback once stopped', async () => {
    const video = mountMedia();
    await loaded(video);
    const ledger = record();
    cleanups.push(() => ledger.stop());
    const { engine, stopSession } = await used(video);
    // The fight put the shield up: its listener is there to be taken away.
    expect(
      ledger.listeners.some(({ target, type }) => target === window && type === 'ratechange'),
    ).toBe(true);
    stopSession();
    engine.stop();
    // A listener on a node taken out of the page goes with it; what stays reachable is a leak.
    const alive = ledger.listeners
      .filter(({ target }) => target === window || (target instanceof Node && target.isConnected))
      .map(
        ({ target, type }) => `${type} on ${target instanceof Node ? target.nodeName : 'window'}`,
      );
    expect(alive).toEqual([]);
    expect(ledger.observers.size).toBe(0);
    expect(ledger.timers.size).toBe(0);
    expect(ledger.intervals.size).toBe(0);
    expect(ledger.frames.size).toBe(0);
  });

  it('drops the overlay timer still waiting when the page stops', async () => {
    const video = mountMedia();
    await loaded(video);
    const ledger = record();
    cleanups.push(() => ledger.stop());
    const engine = createMediaEngine(window);
    const stopSession = await startPageSession({
      window,
      engine,
      settings: memorySettings(),
      profiles: memoryProfiles(),
      l10n: ENGLISH,
    });
    const rect = video.getBoundingClientRect();
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: rect.left + 20, clientY: rect.top + 20 }),
    );
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 4000, clientY: 4000 }));
    expect(ledger.timers.size).toBe(1);
    stopSession();
    engine.stop();
    expect(ledger.timers.size).toBe(0);
  });
});
