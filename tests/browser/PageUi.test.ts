// What runs in the page after the user calls the extension: shortcuts and overlay, with real
// media and real events, including how they leave the page and other scripts alone.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import { HIDE_AFTER_MS } from '../../src/page/overlay/Overlay.ts';
import { startPageSession } from '../../src/page/PageSession.ts';
import { eventsDelivered, loaded, mountMedia, resetPage } from './media.ts';
import { ENGLISH, type MemorySettings, memoryProfiles, memorySettings, settled } from './ui.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

async function session(stored: Record<string, unknown> = {}, target: Window = window) {
  const engine: MediaEngine = createMediaEngine(target);
  const settings: MemorySettings = memorySettings(stored);
  const stop = await startPageSession({
    window: target,
    engine,
    settings,
    profiles: memoryProfiles(),
    l10n: ENGLISH,
  });
  cleanups.push(() => {
    stop();
    engine.stop();
  });
  return { engine, settings };
}

async function videoSession(stored: Record<string, unknown> = {}) {
  const video = mountMedia({ seconds: 120 });
  await loaded(video);
  return { video, ...(await session(stored)) };
}

/** A key event from `target`, the way a keyboard produces it; returns whether the page kept it. */
function key(
  type: 'keydown' | 'keyup',
  code: string,
  target: EventTarget = document.body,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent(type, {
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  let reachedPage = false;
  const listener = () => {
    reachedPage = true;
  };
  document.addEventListener(type, listener);
  target.dispatchEvent(event);
  document.removeEventListener(type, listener);
  return { prevented: event.defaultPrevented, reachedPage };
}

describe('shortcuts on the page', () => {
  it('apply the bound action and keep the key from the page', async () => {
    const { video } = await videoSession();
    const result = key('keydown', 'BracketRight');
    await settled();
    expect(video.playbackRate).toBe(1.25);
    expect(result).toEqual({ prevented: true, reachedPage: false });
  });

  it('let every other key through untouched', async () => {
    const { video } = await videoSession();
    expect(key('keydown', 'KeyK')).toEqual({ prevented: false, reachedPage: true });
    expect(key('keydown', 'BracketRight', document.body, { ctrlKey: true })).toEqual({
      prevented: false,
      reachedPage: true,
    });
    await settled();
    expect(video.playbackRate).toBe(1);
  });

  it('never act while the user types, in the page or inside a shadow root', async () => {
    const { video } = await videoSession();
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    const host = document.createElement('div');
    const shadowInput = document.createElement('textarea');
    host.attachShadow({ mode: 'open' }).append(shadowInput);
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    document.body.append(input, editor, host, textbox);
    for (const target of [input, editor, shadowInput, textbox]) {
      expect(key('keydown', 'BracketRight', target)).toEqual({
        prevented: false,
        reachedPage: true,
      });
    }
    await settled();
    expect(video.playbackRate).toBe(1);
  });

  it('do act on a checkbox or a button, which take no text', async () => {
    const { video } = await videoSession();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.append(checkbox);
    key('keydown', 'BracketRight', checkbox);
    await settled();
    expect(video.playbackRate).toBe(1.25);
  });

  it('stay out of the way on a page without media', async () => {
    await session();
    expect(key('keydown', 'BracketRight')).toEqual({ prevented: false, reachedPage: true });
  });

  it('can be switched off', async () => {
    const { video } = await videoSession({ pageShortcuts: false });
    expect(key('keydown', 'BracketRight')).toEqual({ prevented: false, reachedPage: true });
    await settled();
    expect(video.playbackRate).toBe(1);
  });

  it('follow a binding changed in the options', async () => {
    const { video, settings } = await videoSession();
    const loaded_ = await settings.load();
    await settings.save('bindings', {
      ...loaded_.bindings,
      faster: { code: 'KeyF', alt: true, ctrl: false, meta: false, shift: false },
    });
    await settled();
    expect(key('keydown', 'BracketRight')).toEqual({ prevented: false, reachedPage: true });
    key('keydown', 'KeyF', document.body, { altKey: true });
    await settled();
    expect(video.playbackRate).toBe(1.25);
  });

  it('hold the hold speed while the key is down, ignoring auto-repeat', async () => {
    const { video } = await videoSession({ holdRate: 2.5 });
    video.playbackRate = 1.25;
    key('keydown', 'Semicolon');
    await settled();
    expect(video.playbackRate).toBe(2.5);
    key('keydown', 'Semicolon', document.body, { repeat: true });
    key('keydown', 'Semicolon', document.body, { repeat: true });
    await settled();
    expect(video.playbackRate).toBe(2.5);
    expect(key('keyup', 'Semicolon')).toEqual({ prevented: true, reachedPage: false });
    await settled();
    expect(video.playbackRate).toBe(1.25);
  });

  it('end the hold when the window loses focus', async () => {
    const { video } = await videoSession();
    key('keydown', 'Semicolon');
    await settled();
    expect(video.playbackRate).toBe(3);
    window.dispatchEvent(new Event('blur'));
    await settled();
    expect(video.playbackRate).toBe(1);
  });

  it('repeat steps but not toggles while a key is held', async () => {
    const { video, settings } = await videoSession();
    const current = await settings.load();
    await settings.save('bindings', {
      ...current.bindings,
      'toggle-pitch': { code: 'KeyP', alt: true, ctrl: false, meta: false, shift: false },
    });
    await settled();
    key('keydown', 'BracketRight');
    key('keydown', 'BracketRight', document.body, { repeat: true });
    await settled();
    expect(video.playbackRate).toBe(1.5);
    key('keydown', 'KeyP', document.body, { altKey: true });
    await settled();
    expect(video.preservesPitch).toBe(false);
    key('keydown', 'KeyP', document.body, { altKey: true, repeat: true });
    await settled();
    expect(video.preservesPitch).toBe(false);
  });
});

function overlayHost(): HTMLElement | null {
  return document.querySelector('fleetfoot-engine-overlay');
}

/** Whether the overlay is drawn on the page, not just marked visible. */
function shown(): boolean {
  return overlayHost()?.checkVisibility() ?? false;
}

function pointerOver(video: HTMLMediaElement): void {
  const rect = video.getBoundingClientRect();
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: rect.left + 20,
      clientY: rect.top + 20,
      bubbles: true,
    }),
  );
}

describe('overlay', () => {
  it('appears over the player under the pointer, inside a closed shadow root', async () => {
    const { video } = await videoSession();
    await settled();
    pointerOver(video);
    const host = overlayHost();
    expect(host).not.toBeNull();
    expect(shown()).toBe(true);
    // The page cannot look inside it.
    expect(host?.shadowRoot).toBeNull();
    const rect = video.getBoundingClientRect();
    const bounds = host?.getBoundingClientRect();
    expect(bounds?.left).toBeGreaterThanOrEqual(rect.left);
    expect(bounds?.top).toBeGreaterThanOrEqual(rect.top);
  });

  it('takes no space in the page and leaves the page layout as it was', async () => {
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    const before = document.body.getBoundingClientRect().height;
    await session();
    pointerOver(video);
    expect(document.body.getBoundingClientRect().height).toBe(before);
    expect(getComputedStyle(overlayHost() as Element).position).toBe('fixed');
  });

  it('hides after the pointer leaves, with one timer and nothing running while it stays', async () => {
    vi.useFakeTimers();
    const { video } = await videoSession();
    pointerOver(video);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 2000, clientY: 2000 }));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(HIDE_AFTER_MS - 1);
    expect(shown()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(shown()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is not created when switched off, and goes away when switched off', async () => {
    const { video, settings } = await videoSession({ overlayEnabled: false });
    pointerOver(video);
    expect(overlayHost()).toBeNull();
    await settings.save('overlayEnabled', true);
    await settled();
    pointerOver(video);
    expect(shown()).toBe(true);
    await settings.save('overlayEnabled', false);
    await settled();
    expect(overlayHost()).toBeNull();
  });

  it('can be hidden for the page with its shortcut', async () => {
    const { video, settings } = await videoSession();
    const current = await settings.load();
    await settings.save('bindings', {
      ...current.bindings,
      'toggle-overlay': { code: 'KeyO', alt: true, ctrl: false, meta: false, shift: false },
    });
    await settled();
    pointerOver(video);
    key('keydown', 'KeyO', document.body, { altKey: true });
    expect(shown()).toBe(false);
    pointerOver(video);
    expect(shown()).toBe(false);
  });

  it('never shows on a player too small to hold it', async () => {
    const tiny = mountMedia({ seconds: 120, width: 40, height: 20 });
    await loaded(tiny);
    const { engine } = await session();
    await engine.handleMessage({ v: 1, type: 'set-rate', rate: 1.5 });
    await settled();
    pointerOver(tiny);
    expect(shown()).toBe(false);
  });

  it('stays out of the page when there is no media', async () => {
    await session();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    expect(overlayHost()).toBeNull();
  });

  it('takes keys and clicks on its controls without the page seeing them', async () => {
    const { video } = await videoSession();
    pointerOver(video);
    // The browser's own keyboard reaches the controls inside the closed shadow root.
    for (let step = 0; step < 10 && document.activeElement !== overlayHost(); step++) {
      await userEvent.tab();
    }
    expect(document.activeElement).toBe(overlayHost());
    let pageEvents = 0;
    const count = () => pageEvents++;
    for (const type of ['keydown', 'keyup', 'click']) document.addEventListener(type, count);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await settled();
    for (const type of ['keydown', 'keyup', 'click']) document.removeEventListener(type, count);
    expect(video.playbackRate).toBe(0.75);
    expect(pageEvents).toBe(0);
  });

  /** Moves the keyboard focus onto the drag handle, the overlay's first control. */
  async function focusHandle(video: HTMLMediaElement): Promise<void> {
    pointerOver(video);
    for (let step = 0; step < 10 && document.activeElement !== overlayHost(); step++) {
      await userEvent.tab();
    }
    expect(document.activeElement).toBe(overlayHost());
  }

  it('moves with the arrow keys and never past the edge of its player', async () => {
    const { video, settings } = await videoSession({ overlayPosition: { x: 0.98, y: 0 } });
    await focusHandle(video);
    await userEvent.keyboard('{ArrowRight}');
    await settled();
    expect(settings.stored['overlayPosition']).toEqual({ x: 1, y: 0 });
    await userEvent.keyboard('{ArrowUp}');
    await settled();
    expect(settings.stored['overlayPosition']).toEqual({ x: 1, y: 0 });
  });

  it('stays on its player when its extra controls open at the edge', async () => {
    const { video } = await videoSession({ overlayPosition: { x: 1, y: 0 } });
    await focusHandle(video);
    // Slower, faster, 1×, then «more».
    for (let step = 0; step < 4; step++) await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await settled();
    const player = video.getBoundingClientRect();
    expect(overlayHost()?.getBoundingClientRect().right).toBeLessThanOrEqual(player.right);
  });

  it('follows forced colours only while it runs, and leaves nothing behind when stopped', async () => {
    // A window whose forced-colours query records who listens to it.
    const listening: AbortSignal[] = [];
    const query = Object.assign(new EventTarget(), { matches: false });
    const listen = query.addEventListener.bind(query);
    query.addEventListener = (type, listener, options) => {
      if (typeof options === 'object' && options.signal !== undefined)
        listening.push(options.signal);
      else listening.push(new AbortController().signal);
      listen(type, listener, options);
    };
    const target = new Proxy(window, {
      get(real, key) {
        if (key === 'matchMedia') return () => query;
        const value: unknown = Reflect.get(real, key, real);
        return typeof value === 'function' ? value.bind(real) : value;
      },
    });
    const video = mountMedia({ seconds: 120 });
    await loaded(video);
    const engine = createMediaEngine(window);
    const settings = memorySettings();
    const stop = await startPageSession({
      window: target,
      engine,
      settings,
      profiles: memoryProfiles(),
      l10n: ENGLISH,
    });
    expect(listening.length).toBeGreaterThan(0);
    expect(listening.every((signal) => !signal.aborted)).toBe(true);
    stop();
    engine.stop();
    expect(listening.every((signal) => signal.aborted)).toBe(true);
  });
});

describe('overlay under a strict page CSP', () => {
  it('keeps its look: styles are set through CSSOM, which no style-src blocks', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:900px;height:600px';
    document.body.append(frame);
    cleanups.push(() => frame.remove());
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (frameDocument === null || frameWindow === null) throw new Error('no frame');
    const csp = frameDocument.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "style-src 'none'";
    frameDocument.head.append(csp);
    // A <style> element is refused under this policy: the probe proves the policy is in force.
    const probe = frameDocument.createElement('style');
    probe.textContent = 'body { margin: 33px; }';
    frameDocument.head.append(probe);
    expect(frameWindow.getComputedStyle(frameDocument.body).marginTop).not.toBe('33px');

    const video = frameDocument.createElement('video');
    video.muted = true;
    video.style.width = '640px';
    video.style.height = '360px';
    frameDocument.body.append(video);
    await session({}, frameWindow);
    await eventsDelivered();
    const rect = video.getBoundingClientRect();
    frameWindow.dispatchEvent(
      new (frameWindow as typeof window).PointerEvent('pointermove', {
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    );
    const host = frameDocument.querySelector('fleetfoot-engine-overlay') as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(frameWindow.getComputedStyle(host as Element).position).toBe('fixed');
    expect(frameWindow.getComputedStyle(host as Element).zIndex).toBe('2147483647');
  });
});
