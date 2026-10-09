// Pushes the engine state to whoever shows it (popup, overlay) when something visible changes.
// Event-driven only: media events, discovery and commands. Media listeners exist only while
// someone is subscribed, and changes in the same turn are sent once.

import type { EngineState } from '../messages/Protocol.ts';

/** Media events that can change what the interface shows, playback position aside. */
const MEDIA_EVENTS = [
  'ratechange',
  'play',
  'pause',
  'ended',
  'seeked',
  'durationchange',
  'loadedmetadata',
  'emptied',
  'volumechange',
  'enterpictureinpicture',
  'leavepictureinpicture',
] as const;

/** Fires many times a second while playing: listened to only for subscribers that show time. */
const TIME_EVENT = 'timeupdate';

export type StateListener = (state: EngineState) => void;

export interface SubscribeOptions {
  /** The subscriber shows the position or remaining time (the popup); the overlay does not. */
  readonly time: boolean;
}

interface Subscriber {
  readonly listener: StateListener;
  readonly time: boolean;
}

/** What the interface shows: positions to the second, which is what the clocks display. */
function visibleKey(state: EngineState): string {
  return JSON.stringify(state, (key, value: unknown) => {
    if (typeof value !== 'number') return value;
    return key === 'currentTime' || key === 'original' || key === 'atRate'
      ? Math.floor(value)
      : value;
  });
}

export class StateFeed {
  readonly #snapshot: () => EngineState;
  readonly #media: () => readonly HTMLMediaElement[];
  readonly #subscribers = new Set<Subscriber>();
  readonly #attached = new Map<HTMLMediaElement, AbortController>();
  #timeAttached = false;
  readonly #onMediaEvent = (): void => this.changed();
  #scheduled = false;
  #lastKey: string | null = null;

  constructor(snapshot: () => EngineState, media: () => readonly HTMLMediaElement[]) {
    this.#snapshot = snapshot;
    this.#media = media;
  }

  /** Sends the current state at once, then every visible change, until unsubscribed. */
  subscribe(listener: StateListener, options: SubscribeOptions): () => void {
    const subscriber: Subscriber = { listener, time: options.time };
    const first = this.#subscribers.size === 0;
    this.#subscribers.add(subscriber);
    this.#reattach();
    const state = this.#snapshot();
    // With other subscribers, a change already scheduled must still reach them.
    if (first) this.#lastKey = visibleKey(state);
    listener(state);
    return () => {
      this.#subscribers.delete(subscriber);
      this.#reattach();
    };
  }

  /** A media element entered the page. */
  track(media: HTMLMediaElement): void {
    if (this.#subscribers.size === 0 || this.#attached.has(media)) return;
    const abort = new AbortController();
    const types = this.#timeAttached ? [...MEDIA_EVENTS, TIME_EVENT] : MEDIA_EVENTS;
    for (const type of types) {
      media.addEventListener(type, this.#onMediaEvent, { signal: abort.signal, passive: true });
    }
    this.#attached.set(media, abort);
  }

  untrack(media: HTMLMediaElement): void {
    this.#attached.get(media)?.abort();
    this.#attached.delete(media);
  }

  /** Something may have changed: the state is compared and sent once, after the current task. */
  changed(): void {
    if (this.#subscribers.size === 0 || this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.#subscribers.size === 0) return;
      const state = this.#snapshot();
      const key = visibleKey(state);
      if (key === this.#lastKey) return;
      this.#lastKey = key;
      for (const { listener } of this.#subscribers) listener(state);
    });
  }

  stop(): void {
    this.#subscribers.clear();
    this.#reattach();
  }

  /** Media listeners match the subscribers: none without them, timeupdate only if one shows time. */
  #reattach(): void {
    const wantTime = Array.from(this.#subscribers).some((subscriber) => subscriber.time);
    const wanted = this.#subscribers.size > 0;
    if (wanted && wantTime === this.#timeAttached && this.#attached.size > 0) return;
    for (const abort of this.#attached.values()) abort.abort();
    this.#attached.clear();
    this.#timeAttached = wantTime;
    if (!wanted) {
      this.#lastKey = null;
      return;
    }
    for (const media of this.#media()) this.track(media);
  }
}
