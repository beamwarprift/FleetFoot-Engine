// Hides the engine's own speed changes from a page that fights LOCK (Protocol `LockFight`): such a
// page answers the `ratechange` our write causes, so that one event is stopped before the page's
// listeners see it, and the engine's own consumers are told instead. Only our writes are hidden:
// a change the page makes still reaches everyone.

/** Writes the rate and reads it back: a site may override the setter or the browser may refuse. */
export function writeRate(media: HTMLMediaElement, rate: number): boolean {
  try {
    media.playbackRate = rate;
  } catch {
    return false;
  }
  return media.playbackRate === rate;
}

export interface RateShieldDeps {
  /** A change the page was not shown: whoever shows the state must still hear of it. */
  readonly hidden: (media: HTMLMediaElement) => void;
}

/**
 * Where an event fired at `media` is caught first. A media event does not cross a shadow boundary,
 * so inside a shadow tree its own root is the first node of the path; elsewhere the window is.
 */
function firstOnPath(media: HTMLMediaElement): EventTarget {
  const root = media.getRootNode();
  // Only a document has a window; a shadow root (or a detached tree) is its own first node.
  return (root as Partial<Document>).defaultView ?? root;
}

export class RateShield {
  readonly #hidden: (media: HTMLMediaElement) => void;
  #shielded = new WeakSet<HTMLMediaElement>();
  // The rate our last write gave a shielded element, until the event it causes arrives.
  #pending = new WeakMap<HTMLMediaElement, number>();
  #listening = new WeakSet<EventTarget>();
  #abort = new AbortController();

  constructor(deps: RateShieldDeps) {
    this.#hidden = deps.hidden;
  }

  /** From now on the page does not see the speed changes the engine makes on `media`. */
  shield(media: HTMLMediaElement): void {
    this.#shielded.add(media);
  }

  isShielded(media: HTMLMediaElement): boolean {
    return this.#shielded.has(media);
  }

  /** The page sees every change on `media` again. */
  unshield(media: HTMLMediaElement): void {
    this.#shielded.delete(media);
    this.#pending.delete(media);
  }

  /** The page sees every change again, on every element. */
  release(): void {
    this.#shielded = new WeakSet();
    this.#pending = new WeakMap();
  }

  /** Every speed the engine gives goes through here; on a shielded element the page is not told. */
  write(media: HTMLMediaElement, rate: number): boolean {
    const hide = this.#shielded.has(media) && media.playbackRate !== rate;
    if (hide) this.#listen(firstOnPath(media));
    const written = writeRate(media, rate);
    if (hide && written) this.#pending.set(media, rate);
    else this.#pending.delete(media);
    return written;
  }

  stop(): void {
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#listening = new WeakSet();
    this.release();
  }

  // Capturing at the first node of the path runs before every listener the page put on the
  // element or on its ancestors; one the page put on that same node earlier still runs first.
  #listen(target: EventTarget): void {
    if (this.#listening.has(target)) return;
    this.#listening.add(target);
    target.addEventListener('ratechange', this.#onRateChange, {
      capture: true,
      signal: this.#abort.signal,
    });
  }

  readonly #onRateChange = (event: Event): void => {
    const media = event.target as HTMLMediaElement | null;
    if (media === null) return;
    const rate = this.#pending.get(media);
    if (rate === undefined) return;
    this.#pending.delete(media);
    // The page changed the speed again before this event: what it reports is the page's own.
    if (media.playbackRate !== rate) return;
    event.stopImmediatePropagation();
    this.#hidden(media);
  };
}
