// Remembers which player the user last touched, and when. Nothing else from the event is kept:
// no coordinates, no keys, no page content.

import { isElement, isMediaElement, openShadowRoot, type ShadowReader } from './dom.ts';

function mediaOnPath(event: Event): HTMLMediaElement | null {
  for (const target of event.composedPath()) {
    if (isMediaElement(target)) return target;
  }
  return null;
}

interface PointQuery {
  elementsFromPoint(x: number, y: number): Element[];
}

/**
 * Custom players cover the <video> with their own controls: look beneath the pointer, entering
 * open shadow roots, where `elementsFromPoint` of the outer tree only reports the host.
 * A shadow root's hit list also holds the hosts around it, its own included: each root is
 * queried once, so the cost is one query per shadow root under the pointer.
 */
function mediaAt(
  document: PointQuery,
  x: number,
  y: number,
  shadowRoot: ShadowReader,
): HTMLMediaElement | null {
  const visited = new Set<ShadowRoot>();
  const search = (scope: PointQuery): HTMLMediaElement | null => {
    for (const element of scope.elementsFromPoint(x, y)) {
      if (isMediaElement(element)) return element;
      const shadow = isElement(element) ? shadowRoot(element) : null;
      if (shadow === null || visited.has(shadow)) continue;
      visited.add(shadow);
      if (typeof shadow.elementsFromPoint !== 'function') continue;
      const inner = search(shadow);
      if (inner !== null) return inner;
    }
    return null;
  };
  return search(document);
}

function hasPointerPosition(event: Event): event is Event & { clientX: number; clientY: number } {
  return typeof (event as Partial<MouseEvent>).clientX === 'number';
}

export class InteractionTracker {
  readonly #document: Document;
  readonly #now: () => number;
  readonly #onRecord: () => void;
  readonly #shadowRoot: ShadowReader;
  readonly #last = new WeakMap<HTMLMediaElement, number>();
  readonly #onPointer = (event: Event): void => {
    const media =
      mediaOnPath(event) ??
      (hasPointerPosition(event)
        ? mediaAt(this.#document, event.clientX, event.clientY, this.#shadowRoot)
        : null);
    this.#record(media);
  };
  readonly #onKey = (event: Event): void => {
    this.#record(mediaOnPath(event));
  };
  #listening = false;

  /** `onRecord` runs after each recorded interaction: it can change which player is active. */
  constructor(
    document: Document,
    now: () => number = () => performance.now(),
    onRecord: () => void = () => {},
    shadowRoot: ShadowReader = openShadowRoot,
  ) {
    this.#document = document;
    this.#shadowRoot = shadowRoot;
    this.#now = now;
    this.#onRecord = onRecord;
  }

  start(): void {
    if (this.#listening) return;
    this.#listening = true;
    // Capture and passive: seen before the page can stop propagation, never delays the page.
    this.#document.addEventListener('pointerdown', this.#onPointer, {
      capture: true,
      passive: true,
    });
    this.#document.addEventListener('keydown', this.#onKey, { capture: true, passive: true });
  }

  stop(): void {
    this.#listening = false;
    this.#document.removeEventListener('pointerdown', this.#onPointer, { capture: true });
    this.#document.removeEventListener('keydown', this.#onKey, { capture: true });
  }

  lastInteraction(media: HTMLMediaElement): number | null {
    return this.#last.get(media) ?? null;
  }

  #record(media: HTMLMediaElement | null): void {
    if (media === null) return;
    this.#last.set(media, this.#now());
    this.#onRecord();
  }
}
