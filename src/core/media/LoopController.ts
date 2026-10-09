// A–B loop owned by one media element. Markers never move to another element and are
// dropped when the same element loads a different source.

import type { LoopState } from '../messages/Protocol.ts';

export type LoopError = 'not-loopable' | 'loop-invalid';

interface Markers {
  a: number | null;
  b: number | null;
  enabled: boolean;
  readonly source: string;
  stop: (() => void) | null;
}

/** Live streams and unknown durations have no B ≤ duration to respect. */
function isLoopable(media: HTMLMediaElement): boolean {
  return Number.isFinite(media.duration) && media.duration > 0;
}

type FrameCallbackElement = HTMLMediaElement & {
  requestVideoFrameCallback(callback: () => void): number;
  cancelVideoFrameCallback(handle: number): void;
};

function hasFrameCallbacks(media: HTMLMediaElement): media is FrameCallbackElement {
  return 'requestVideoFrameCallback' in media && 'cancelVideoFrameCallback' in media;
}

export class LoopController {
  readonly #markers = new WeakMap<HTMLMediaElement, Markers>();

  state(media: HTMLMediaElement): LoopState | null {
    const markers = this.#markers.get(media);
    return markers === undefined ? null : { a: markers.a, b: markers.b, enabled: markers.enabled };
  }

  setA(media: HTMLMediaElement): LoopError | null {
    if (!isLoopable(media)) return 'not-loopable';
    const markers = this.#markersOf(media);
    const a = media.currentTime;
    if (markers.b !== null && a >= markers.b) return 'loop-invalid';
    markers.a = a;
    return null;
  }

  setB(media: HTMLMediaElement): LoopError | null {
    if (!isLoopable(media)) return 'not-loopable';
    const markers = this.#markersOf(media);
    const b = Math.min(media.currentTime, media.duration);
    if (b <= (markers.a ?? 0)) return 'loop-invalid';
    markers.b = b;
    return null;
  }

  setEnabled(media: HTMLMediaElement, enabled: boolean): LoopError | null {
    const markers = this.#markers.get(media);
    if (!enabled) {
      if (markers !== undefined) this.#disable(markers);
      return null;
    }
    if (!isLoopable(media)) return 'not-loopable';
    if (markers === undefined || markers.b === null) return 'loop-invalid';
    const a = markers.a ?? 0;
    if (media.currentTime < a || media.currentTime >= markers.b) media.currentTime = a;
    if (!markers.enabled) {
      markers.enabled = true;
      markers.stop = this.#watch(media, markers);
    }
    return null;
  }

  clear(media: HTMLMediaElement): void {
    const markers = this.#markers.get(media);
    if (markers === undefined) return;
    this.#disable(markers);
    this.#markers.delete(media);
  }

  /** Markers belong to the content they were set on. */
  sourceChanged(media: HTMLMediaElement): void {
    const markers = this.#markers.get(media);
    if (markers !== undefined && markers.source !== media.currentSrc) this.clear(media);
  }

  #markersOf(media: HTMLMediaElement): Markers {
    let markers = this.#markers.get(media);
    if (markers === undefined) {
      markers = { a: null, b: null, enabled: false, source: media.currentSrc, stop: null };
      this.#markers.set(media, markers);
    }
    return markers;
  }

  #disable(markers: Markers): void {
    markers.enabled = false;
    markers.stop?.();
    markers.stop = null;
  }

  /**
   * Checks the B boundary on every presented frame of a video (frame precision, nothing runs while
   * paused) and on timeupdate for every media. Listeners exist only while the loop is on.
   */
  #watch(media: HTMLMediaElement, markers: Markers): () => void {
    const check = (): void => {
      if (markers.enabled && markers.b !== null && media.currentTime >= markers.b) {
        media.currentTime = markers.a ?? 0;
      }
    };
    const abort = new AbortController();
    media.addEventListener('timeupdate', check, { signal: abort.signal });
    if (!hasFrameCallbacks(media)) return () => abort.abort();
    let handle = 0;
    const onFrame = (): void => {
      check();
      if (!abort.signal.aborted) handle = media.requestVideoFrameCallback(onFrame);
    };
    handle = media.requestVideoFrameCallback(onFrame);
    return () => {
      abort.abort();
      media.cancelVideoFrameCallback(handle);
    };
  }
}
