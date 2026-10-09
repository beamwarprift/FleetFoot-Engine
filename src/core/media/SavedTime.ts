// Measures the time saved on players FleetFoot Engine sped up: content advanced at a rate r > 1
// takes 1/r of its length to watch, so each step of real playback saves step × (1 − 1/r).
// Event-driven (timeupdate). A jump is never playback: the browser fires `seeking` for every
// change of position and `loadstart` / `emptied` for a new source (HTML media element), and each
// of them restarts the measure.
/** Saved seconds gathered before reporting: keeps messages rare. Chosen value. */
export const REPORT_AFTER_SECONDS = 30;

export interface SavedTimeDeps {
  /** True when the element plays at a rate FleetFoot Engine gave it. */
  readonly isOurs: (media: HTMLMediaElement) => boolean;
  readonly report: (seconds: number) => void;
}

export class SavedTime {
  readonly #deps: SavedTimeDeps;
  readonly #last = new WeakMap<HTMLMediaElement, number>();
  #pending = 0;

  constructor(deps: SavedTimeDeps) {
    this.#deps = deps;
  }

  /** Follows an element until `signal` aborts. */
  watch(media: HTMLMediaElement, signal: AbortSignal): void {
    const options = { signal, passive: true };
    media.addEventListener('timeupdate', () => this.#progress(media), options);
    for (const type of ['seeking', 'loadstart', 'emptied']) {
      media.addEventListener(type, () => this.#last.delete(media), options);
    }
    for (const type of ['pause', 'ended']) {
      media.addEventListener(type, () => this.flush(), options);
    }
  }

  /** Reports what was gathered so far (page hidden, engine stopping). */
  flush(): void {
    if (this.#pending <= 0) return;
    const seconds = this.#pending;
    this.#pending = 0;
    this.#deps.report(seconds);
  }

  #progress(media: HTMLMediaElement): void {
    const position = media.currentTime;
    const last = this.#last.get(media);
    this.#last.set(media, position);
    if (last === undefined) return;
    const advanced = position - last;
    if (!(advanced > 0)) return;
    const rate = media.playbackRate;
    if (!(rate > 1) || !this.#deps.isOurs(media)) return;
    this.#pending += advanced * (1 - 1 / rate);
    if (this.#pending >= REPORT_AFTER_SECONDS) this.flush();
  }
}
