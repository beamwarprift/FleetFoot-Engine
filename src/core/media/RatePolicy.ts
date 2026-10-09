// How the user's chosen rate holds against the site.
// FOLLOW: applied once, then the site is free. SMART (default): re-applied when the player is
// recreated, replaced or changes source, never fighting each ratechange. LOCK: also restored
// whenever the site changes it. When another source answers every restore at once, the user's
// `LockFight` decides: LOCK yields on that element, or hides its own changes from the page and
// keeps restoring, with or without a bound.

import type { LockFight, RatePolicyName } from '../messages/Protocol.ts';
import type { Rate } from './PlaybackRate.ts';
import { DEFAULT_LOCK_FIGHT, DEFAULT_RATE_POLICY } from './Presets.ts';

/**
 * A change counts as an answer to our restore when it arrives within this window: an event-driven
 * counter-write lands within one event dispatch of ours. A site resetting on its own schedule
 * (slower than this) is still overruled. Chosen value, not a platform constant.
 */
export const CONTEST_WINDOW_MS = 100;
/** Immediate answers in a row before LOCK answers the fight as the user chose. Chosen value. */
export const CONTEST_LIMIT = 5;
/**
 * Shortest gap between two BRAKED restores of one element: at most 100 a second. Measured in
 * Chromium against a page that hears each change before the engine and answers it at once: about
 * 5% of one processor core at this bound, a whole core without it.
 */
export const BRAKE_INTERVAL_MS = 10;

/** The part of `RateShield` the policy decides on. */
export interface ShieldControl {
  shield(media: HTMLMediaElement): void;
  isShielded(media: HTMLMediaElement): boolean;
  unshield(media: HTMLMediaElement): void;
  release(): void;
}

/** Runs `run` once after `ms`; the returned function cancels it. */
export type Schedule = (run: () => void, ms: number) => () => void;

const timeout: Schedule = (run, ms) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

export interface RatePolicyDeps {
  readonly write: (media: HTMLMediaElement, rate: number) => boolean;
  /** A held element follows the hold, not the policy, until the hold ends. */
  readonly isHeld: (media: HTMLMediaElement) => boolean;
  readonly shield: ShieldControl;
  readonly now?: () => number;
  readonly schedule?: Schedule;
}

interface Streak {
  count: number;
  lastRestore: number;
}

export class RatePolicy {
  readonly #deps: RatePolicyDeps;
  #policy: RatePolicyName = DEFAULT_RATE_POLICY;
  #fight: LockFight = DEFAULT_LOCK_FIGHT;
  #desired: Rate | null = null;
  // A remembered speed waits for the first media that becomes the target, whatever the policy.
  #starting = false;
  // Elements the user's rate was applied to: only these are kept at it.
  readonly #managed = new WeakSet<HTMLMediaElement>();
  #streaks = new WeakMap<HTMLMediaElement, Streak>();
  // Elements where another source answers every LOCK restore: left alone until the next deliberate
  // change or new source.
  #contested = new WeakSet<HTMLMediaElement>();
  // When each shielded element was last restored (the BRAKED bound counts from there), and the one
  // restore waiting to run.
  #restored = new WeakMap<HTMLMediaElement, number>();
  readonly #waiting = new Map<HTMLMediaElement, () => void>();
  readonly #now: () => number;
  readonly #schedule: Schedule;

  constructor(deps: RatePolicyDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? (() => performance.now());
    this.#schedule = deps.schedule ?? timeout;
  }

  get policy(): RatePolicyName {
    return this.#policy;
  }

  /** Choosing a policy is a deliberate act: every element starts over, seen by the page. */
  set policy(policy: RatePolicyName) {
    this.#policy = policy;
    this.#startOver();
  }

  get fight(): LockFight {
    return this.#fight;
  }

  /** So is choosing how LOCK answers a fight. */
  set fight(fight: LockFight) {
    this.#fight = fight;
    this.#startOver();
  }

  get desired(): Rate | null {
    return this.#desired;
  }

  /** A deliberate change applied to these elements. */
  chose(rate: Rate, media: readonly HTMLMediaElement[]): void {
    this.#desired = rate;
    this.#starting = false;
    for (const element of media) {
      this.#managed.add(element);
      this.#release(element);
    }
  }

  /** The element plays at the user's rate because FleetFoot Engine gave it. */
  holdsUserRate(media: HTMLMediaElement): boolean {
    return (
      this.#managed.has(media) && this.#desired !== null && media.playbackRate === this.#desired
    );
  }

  /** LOCK gave up on this element because another source keeps answering. */
  isContested(media: HTMLMediaElement): boolean {
    return this.#contested.has(media);
  }

  /** The remembered speed, waiting for a target: FOLLOW gives it once too, then leaves the site. */
  start(rate: Rate): void {
    this.#desired = rate;
    this.#starting = true;
  }

  /** The media that arrived together got the starting speed: from now on the policy decides. */
  settle(): void {
    this.#starting = false;
  }

  /** False while nothing could be adopted: lets callers skip ranking the page. */
  get adopting(): boolean {
    return (this.#policy !== 'follow' || this.#starting) && this.#desired !== null;
  }

  /** A newly discovered element that became the target: the replacement of a managed player. */
  adopt(media: HTMLMediaElement): void {
    if (!this.adopting) return;
    this.#managed.add(media);
    this.#enforce(media);
  }

  /** The browser resets playbackRate to defaultPlaybackRate when a new source loads. */
  sourceChanged(media: HTMLMediaElement): void {
    this.#release(media);
    if (this.#policy !== 'follow' && this.#managed.has(media)) this.#enforce(media);
  }

  rateChanged(media: HTMLMediaElement): void {
    if (this.#policy !== 'lock' || !this.#managed.has(media) || this.#contested.has(media)) return;
    if (!this.#needsEnforcing(media)) return;
    if (this.#deps.shield.isShielded(media)) {
      this.#restoreShielded(media);
      return;
    }
    const now = this.#now();
    const streak = this.#streaks.get(media);
    const count =
      streak !== undefined && now - streak.lastRestore <= CONTEST_WINDOW_MS ? streak.count + 1 : 1;
    if (count <= CONTEST_LIMIT) {
      this.#streaks.set(media, { count, lastRestore: now });
      this.#enforce(media);
      return;
    }
    this.#streaks.delete(media);
    if (this.#fight === 'yield') {
      this.#contested.add(media);
      return;
    }
    this.#deps.shield.shield(media);
    this.#restoreShielded(media);
  }

  /** The element left the page: nothing waits on it any more. */
  forget(media: HTMLMediaElement): void {
    this.#cancel(media);
    this.#deps.shield.unshield(media);
  }

  // Never inside the event that told us of the change: a listener the page put after ours on that
  // same event would read the restored speed at once and answer it. Right after it instead, or,
  // BRAKED, once the bound allows.
  #restoreShielded(media: HTMLMediaElement): void {
    if (this.#waiting.has(media)) return;
    const last = this.#restored.get(media) ?? Number.NEGATIVE_INFINITY;
    const wait =
      this.#fight === 'unbraked' ? 0 : Math.max(0, last + BRAKE_INTERVAL_MS - this.#now());
    const cancel = this.#schedule(() => {
      this.#waiting.delete(media);
      this.#restored.set(media, this.#now());
      this.#enforce(media);
    }, wait);
    this.#waiting.set(media, cancel);
  }

  #cancel(media: HTMLMediaElement): void {
    this.#waiting.get(media)?.();
    this.#waiting.delete(media);
  }

  #startOver(): void {
    this.#contested = new WeakSet();
    this.#streaks = new WeakMap();
    this.#restored = new WeakMap();
    for (const media of [...this.#waiting.keys()]) this.#cancel(media);
    this.#deps.shield.release();
  }

  #release(media: HTMLMediaElement): void {
    this.#contested.delete(media);
    this.#streaks.delete(media);
  }

  #needsEnforcing(media: HTMLMediaElement): boolean {
    const desired = this.#desired;
    return desired !== null && !this.#deps.isHeld(media) && media.playbackRate !== desired;
  }

  #enforce(media: HTMLMediaElement): void {
    const desired = this.#desired;
    if (desired === null || !this.#needsEnforcing(media)) return;
    this.#deps.write(media, desired);
  }
}
