// Players and fields inside closed shadow roots (Compatibility Mode): seen only through
// a reader that has the extension's access, never through the page's own `shadowRoot`.

import { afterEach, describe, expect, it } from 'vitest';
import { extensionShadowRoot } from '../../src/browser/shadowRoots.ts';
import { createMediaEngine, type MediaEngine } from '../../src/core/MediaEngine.ts';
import type { ShadowReader } from '../../src/core/media/dom.ts';
import { InteractionTracker } from '../../src/core/media/InteractionTracker.ts';
import { isTyping } from '../../src/page/typing.ts';
import { loaded, mountMedia, mutationsDelivered, resetPage } from './media.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPage();
});

/** Closed roots as the extension sees them: here, the ones this test attached. */
const closedRoots = new WeakMap<Element, ShadowRoot>();
const reader: ShadowReader = (element) => closedRoots.get(element) ?? element.shadowRoot;

function closedHost(): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('div');
  document.body.append(host);
  cleanups.push(() => host.remove());
  const root = host.attachShadow({ mode: 'closed' });
  closedRoots.set(host, root);
  return { host, root };
}

function engine(shadowRoot?: ShadowReader): MediaEngine {
  const created = createMediaEngine(window, shadowRoot === undefined ? {} : { shadowRoot });
  cleanups.push(() => created.stop());
  return created;
}

async function players(target: MediaEngine): Promise<number> {
  return (await target.handleMessage({ v: 1, type: 'get-state' })).state.players.length;
}

describe('a closed shadow root', () => {
  it('hides its player from the page view, and the extension view finds and controls it', async () => {
    const { root } = closedHost();
    const video = mountMedia({ parent: root as unknown as HTMLElement });
    await loaded(video);
    expect(await players(engine())).toBe(0);
    const seeing = engine(reader);
    expect(await players(seeing)).toBe(1);
    await seeing.handleMessage({ v: 1, type: 'set-rate', rate: 2 });
    expect(video.playbackRate).toBe(2);
  });

  it('is watched: a player added inside it later is found', async () => {
    const { root } = closedHost();
    const seeing = engine(reader);
    expect(await players(seeing)).toBe(0);
    const video = mountMedia({ parent: root as unknown as HTMLElement });
    await mutationsDelivered();
    await loaded(video);
    expect(await players(seeing)).toBe(1);
  });

  it('is entered to find the player under the pointer', async () => {
    const { root } = closedHost();
    const video = mountMedia({ parent: root as unknown as HTMLElement });
    await loaded(video);
    const seen: number[] = [];
    const tracker = new InteractionTracker(
      document,
      () => 1,
      () => seen.push(1),
      reader,
    );
    tracker.start();
    cleanups.push(() => tracker.stop());
    const box = video.getBoundingClientRect();
    document.elementFromPoint(box.left + 10, box.top + 10)?.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: box.left + 10,
        clientY: box.top + 10,
        bubbles: true,
        composed: true,
      }),
    );
    expect(tracker.lastInteraction(video)).toBe(1);
  });

  it('holds a field being typed in: shortcuts stay quiet there', () => {
    const { root } = closedHost();
    const field = document.createElement('input');
    root.append(field);
    field.focus();
    const key = new KeyboardEvent('keydown', { key: 's', bubbles: true, composed: true });
    // Seen from the document, the event's path stops at the host.
    let typing: boolean | null = null;
    let typingUnseen: boolean | null = null;
    const listener = (event: Event) => {
      typing = isTyping(event, document, reader);
      typingUnseen = isTyping(event, document);
    };
    document.addEventListener('keydown', listener);
    cleanups.push(() => document.removeEventListener('keydown', listener));
    field.dispatchEvent(key);
    expect(typingUnseen).toBe(false);
    expect(typing).toBe(true);
  });
});

describe("the extension's access", () => {
  it('uses the browser dom access where it exists', () => {
    const { host, root } = closedHost();
    const holder = globalThis as { chrome?: unknown };
    const before = holder.chrome;
    holder.chrome = {
      dom: { openOrClosedShadowRoot: (element: Element) => closedRoots.get(element) ?? null },
    };
    cleanups.push(() => {
      holder.chrome = before;
    });
    expect(extensionShadowRoot()(host)).toBe(root);
  });

  it("else the element's own closed-root property, else open roots only", () => {
    const { host, root } = closedHost();
    const holder = globalThis as { chrome?: unknown };
    const before = holder.chrome;
    holder.chrome = undefined;
    cleanups.push(() => {
      holder.chrome = before;
    });
    const read = extensionShadowRoot();
    expect(read(host)).toBeNull();
    Object.defineProperty(host, 'openOrClosedShadowRoot', { value: root, configurable: true });
    expect(read(host)).toBe(root);
    const open = document.createElement('div');
    const openRoot = open.attachShadow({ mode: 'open' });
    expect(read(open)).toBe(openRoot);
  });
});
