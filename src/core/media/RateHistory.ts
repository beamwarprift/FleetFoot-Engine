// What the engine remembers about rates, in memory only: the previous rate of each element, the
// rates to restore when a hold ends, and the rate under a skipped silence. A temporary rate (a
// hold, a silence) is never remembered as "previous".

import { type Rate, toRate } from './PlaybackRate.ts';

export class RateHistory {
  readonly #previous = new WeakMap<HTMLMediaElement, Rate>();
  // Element → its rate before the hold, exactly as it was (a site may use values off the grid).
  readonly #holds = new Map<HTMLMediaElement, number>();
  // Element → its rate outside the silence it is playing through faster.
  readonly #boosts = new Map<HTMLMediaElement, number>();

  previous(media: HTMLMediaElement): Rate | null {
    return this.#previous.get(media) ?? null;
  }

  /** Remembers `from` as the previous rate when a change to `to` actually changes it. */
  record(media: HTMLMediaElement, from: number, to: Rate): void {
    const previous = toRate(from);
    if (previous !== null && previous !== to) this.#previous.set(media, previous);
  }

  /** The rate a deliberate change starts from: the one before a hold or a silence. */
  baseRate(media: HTMLMediaElement): number {
    return this.#holds.get(media) ?? this.#boosts.get(media) ?? media.playbackRate;
  }

  /** The element plays at a temporary rate: a hold or a silence. The rate policy steps aside. */
  isOverridden(media: HTMLMediaElement): boolean {
    return this.#holds.has(media) || this.#boosts.has(media);
  }

  isBoosted(media: HTMLMediaElement): boolean {
    return this.#boosts.has(media);
  }

  startBoost(media: HTMLMediaElement): void {
    if (!this.#boosts.has(media)) this.#boosts.set(media, media.playbackRate);
  }

  /** The rate to give back when the silence of `media` ends becomes `rate`. */
  rebaseBoost(media: HTMLMediaElement, rate: number): void {
    if (this.#boosts.has(media)) this.#boosts.set(media, rate);
  }

  /** Ends the silence of `media` and returns the rate to restore, if it was in one. */
  endBoost(media: HTMLMediaElement): number | undefined {
    const restore = this.#boosts.get(media);
    this.#boosts.delete(media);
    return restore;
  }

  holding(): boolean {
    return this.#holds.size > 0;
  }

  isHeld(media: HTMLMediaElement): boolean {
    return this.#holds.has(media);
  }

  startHold(media: HTMLMediaElement): void {
    if (!this.#holds.has(media)) this.#holds.set(media, media.playbackRate);
  }

  /** Ends every hold and returns what to restore. */
  endHolds(): Array<readonly [HTMLMediaElement, number]> {
    const holds = Array.from(this.#holds);
    this.#holds.clear();
    return holds;
  }
}
