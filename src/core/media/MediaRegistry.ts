// Event-driven discovery of <video> and <audio>: one scan at start, then MutationObservers on
// childList + subtree for the document and for every open shadow root. No attribute observation
// and no polling.

import { isElement, openShadowRoot, type ShadowReader, scanTree } from './dom.ts';

/** Called once per scan or mutation batch, never once per element. */
export interface RegistryEvents {
  readonly onAdded?: (media: readonly HTMLMediaElement[]) => void;
  readonly onRemoved?: (media: readonly HTMLMediaElement[]) => void;
}

export class MediaRegistry {
  readonly #root: Document;
  readonly #events: RegistryEvents;
  // Iteration needs strong references; entries leave as soon as their element leaves the page.
  readonly #media = new Set<HTMLMediaElement>();
  // Identity by handle: an id is never reused, so a stale id can never point at another element.
  readonly #ids = new WeakMap<HTMLMediaElement, number>();
  // One observer per observed tree: the document and each shadow root the reader sees.
  readonly #observers = new Map<Document | ShadowRoot, MutationObserver>();
  #nextId = 1;

  readonly #shadowRoot: ShadowReader;

  constructor(root: Document, events: RegistryEvents = {}, shadowRoot = openShadowRoot) {
    this.#root = root;
    this.#events = events;
    this.#shadowRoot = shadowRoot;
  }

  start(): void {
    if (this.#observers.size > 0) return;
    this.#observe(this.#root);
    this.#emitAdded(this.#absorb(this.#root));
  }

  stop(): void {
    for (const observer of this.#observers.values()) observer.disconnect();
    this.#observers.clear();
  }

  /** Tracked media in discovery order. Removal is applied when the mutation records arrive. */
  list(): HTMLMediaElement[] {
    return Array.from(this.#media);
  }

  /** The document and every shadow root observed in it. */
  trees(): (Document | ShadowRoot)[] {
    return [...this.#observers.keys()];
  }

  idOf(media: HTMLMediaElement): number | undefined {
    return this.#ids.get(media);
  }

  /** A connected media element with this id. */
  byId(id: number): HTMLMediaElement | undefined {
    return this.list().find((media) => media.isConnected && this.#ids.get(media) === id);
  }

  #observe(tree: Document | ShadowRoot): void {
    if (this.#observers.has(tree)) return;
    const observer = new MutationObserver((records) => this.#onMutations(records));
    observer.observe(tree, { childList: true, subtree: true });
    this.#observers.set(tree, observer);
  }

  /** Tracks the media under `node` and returns the ones that were not tracked yet. */
  #absorb(node: Node): HTMLMediaElement[] {
    const { media, shadowRoots } = scanTree(node, this.#shadowRoot);
    for (const root of shadowRoots) this.#observe(root);
    const added: HTMLMediaElement[] = [];
    for (const element of media) {
      if (!this.#ids.has(element)) this.#ids.set(element, this.#nextId++);
      if (this.#media.has(element)) continue;
      this.#media.add(element);
      added.push(element);
    }
    return added;
  }

  #emitAdded(added: readonly HTMLMediaElement[]): void {
    if (added.length > 0) this.#events.onAdded?.(added);
  }

  #onMutations(records: readonly MutationRecord[]): void {
    const added: HTMLMediaElement[] = [];
    const removedMedia: HTMLMediaElement[] = [];
    const removedRoots: ShadowRoot[] = [];
    for (const record of records) {
      for (const node of record.addedNodes) added.push(...this.#absorb(node));
      for (const node of record.removedNodes) {
        const { media, shadowRoots } = scanTree(node, this.#shadowRoot);
        removedMedia.push(...media);
        removedRoots.push(...shadowRoots);
      }
    }
    // A moved element is removed and added in the same batch: it is still connected and stays.
    const removed = removedMedia.filter((media) => !media.isConnected && this.#media.delete(media));
    if (removed.length > 0) this.#events.onRemoved?.(removed);
    this.#emitAdded(added.filter((media) => this.#media.has(media)));
    for (const root of removedRoots) {
      if (isElement(root.host) && root.host.isConnected) continue;
      this.#observers.get(root)?.disconnect();
      this.#observers.delete(root);
    }
  }
}
