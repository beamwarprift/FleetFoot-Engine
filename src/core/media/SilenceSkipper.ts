// Skip Silence: while the active player plays, its audio is heard and each silence
// plays at the silence speed, then the player goes back to the speed it had. A silence speed-up
// is a temporary rate like a held key: the rate policy steps aside, a hold or a deliberate change
// wins, and the state keeps showing the user's own speed. The speed rises into a silence in a few
// steps, paced by the audio blocks themselves; it drops back at once, so speech never plays fast.
// A speed the page sets during a silence is the one the sound comes back at, unless LOCK keeps
// the user's; the silence itself stays at the silence speed. A page that changes it again within
// the same silence is fighting: that silence is left to it.

import type { SilenceMode, SkipSilenceState } from '../messages/Protocol.ts';
import { type Rate, toRate } from './PlaybackRate.ts';
import { DEFAULT_SILENCE_MODE, DEFAULT_SILENCE_RATE, DEFAULT_SKIP_SILENCE } from './Presets.ts';
import type { RateHistory } from './RateHistory.ts';
import { SILENCE_THRESHOLDS, SilenceDetector } from './SilenceDetector.ts';
import { type ListenStatus, listenTo, type SilenceListen } from './SilenceListener.ts';

export interface SilenceSkipperDeps {
  /** Writes a rate and tells whether the element took it. */
  readonly write: (media: HTMLMediaElement, rate: number) => boolean;
  readonly history: RateHistory;
  /** The player Skip Silence follows: the active one. */
  readonly target: () => HTMLMediaElement | null;
  /** The state changed in a way no page event shows. */
  readonly changed: () => void;
  /** The page changed the speed and the silence left it: the rate policy judges it as usual. */
  readonly released: (media: HTMLMediaElement) => void;
  /** The rate policy keeps the user's speed on `media` whatever the page sets (LOCK). */
  readonly keepsBase: (media: HTMLMediaElement) => boolean;
  readonly listen?: SilenceListen;
}

const FALLBACK_SILENCE_RATE = toRate(DEFAULT_SILENCE_RATE) as Rate;

/**
 * The rise into a silence: this many steps, evenly spread over this many seconds of it, each the
 * same ratio above the last. Chosen values, to be tuned on real recordings.
 */
export const RAMP_STEPS = 4;
export const RAMP_SECONDS = 0.2;

interface Ramp {
  readonly from: number;
  elapsed: number;
  step: number;
}

/** What ends hearing the current player: it stops, or its source changes. */
const STOP_EVENTS = ['pause', 'ended', 'emptied', 'loadstart'] as const;

export class SilenceSkipper {
  readonly #deps: SilenceSkipperDeps;
  readonly #listen: SilenceListen;
  #enabled = DEFAULT_SKIP_SILENCE;
  #mode: SilenceMode = DEFAULT_SILENCE_MODE;
  #silenceRate: Rate = FALLBACK_SILENCE_RATE;
  #media: HTMLMediaElement | null = null;
  #stopListening: (() => void) | null = null;
  #abort: AbortController | null = null;
  #heard = 'listening' as ListenStatus;
  #ramp: Ramp | null = null;
  // The last speed a silence gave the player: any other one there was set by someone else.
  #written: number | null = null;
  // The page already changed the speed once in this silence.
  #pageChanged = false;
  // Players the browser does not let the extension hear, until their source changes.
  readonly #unavailable = new WeakSet<HTMLMediaElement>();

  constructor(deps: SilenceSkipperDeps) {
    this.#deps = deps;
    this.#listen = deps.listen ?? listenTo;
  }

  configure(enabled: boolean, mode: SilenceMode, silenceRate: Rate): void {
    this.#enabled = enabled;
    this.#mode = mode;
    this.#silenceRate = silenceRate;
    this.#detach();
    this.refresh();
    this.#deps.changed();
  }

  /** Follows the active player: heard while it plays, released as soon as it does not. */
  refresh(): void {
    const target = this.#enabled ? this.#deps.target() : null;
    const wanted = target !== null && !target.paused && !target.ended ? target : null;
    if (wanted === this.#media) return;
    this.#detach();
    if (wanted !== null) this.#attach(wanted);
  }

  state(): SkipSilenceState {
    if (!this.#enabled) return { status: 'off' };
    const media = this.#media ?? this.#deps.target();
    if (media !== null && this.#unavailable.has(media)) return { status: 'unavailable' };
    if (media !== null && this.#deps.history.isBoosted(media)) return { status: 'skipping' };
    return { status: this.#media === null ? 'listening' : this.#heard };
  }

  /** A new source may be one the browser lets the extension hear. */
  sourceChanged(media: HTMLMediaElement): void {
    this.#unavailable.delete(media);
  }

  /** Puts the player back at its own speed and lets go of everything. */
  stop(): void {
    this.#detach();
  }

  #attach(media: HTMLMediaElement): void {
    const detector = new SilenceDetector(SILENCE_THRESHOLDS[this.#mode]);
    this.#media = media;
    this.#heard = 'listening';
    const abort = new AbortController();
    this.#abort = abort;
    for (const type of STOP_EVENTS) {
      media.addEventListener(type, () => this.refresh(), { signal: abort.signal });
    }
    media.addEventListener('ratechange', () => this.#rateChanged(media), { signal: abort.signal });
    this.#stopListening = this.#listen(media, {
      block: (db, seconds) => {
        const change = detector.push(db, seconds);
        if (change === 'silence') this.#boost(media);
        else if (change === 'sound') this.#unboost(media);
        else this.#rise(media, seconds);
      },
      status: (status) => {
        this.#heard = status;
        if (status === 'unavailable') {
          this.#unavailable.add(media);
          this.#unboost(media);
          detector.restart();
        } else this.#unavailable.delete(media);
        this.#deps.changed();
      },
    });
  }

  #detach(): void {
    const media = this.#media;
    this.#stopListening?.();
    this.#stopListening = null;
    this.#abort?.abort();
    this.#abort = null;
    this.#media = null;
    if (media !== null) this.#unboost(media);
    this.#ramp = null;
    this.#written = null;
  }

  #boost(media: HTMLMediaElement): void {
    const { history } = this.#deps;
    // A held key wins; a silence never slows a player down.
    if (history.isHeld(media) || media.playbackRate >= this.#silenceRate) return;
    history.startBoost(media);
    this.#pageChanged = false;
    this.#written = media.playbackRate;
    this.#ramp = { from: media.playbackRate, elapsed: 0, step: 0 };
    this.#rise(media, 0);
    this.#deps.changed();
  }

  /** The next step of the rise, once enough of the silence has played. */
  #rise(media: HTMLMediaElement, seconds: number): void {
    const ramp = this.#ramp;
    if (ramp === null) return;
    // A deliberate change or a held key ended the silence's speed.
    if (!this.#deps.history.isBoosted(media)) {
      this.#ramp = null;
      return;
    }
    ramp.elapsed += seconds;
    const step = Math.min(RAMP_STEPS, 1 + Math.floor((ramp.elapsed / RAMP_SECONDS) * RAMP_STEPS));
    if (step <= ramp.step) return;
    ramp.step = step;
    if (step === RAMP_STEPS) this.#ramp = null;
    const ratio = (this.#silenceRate / ramp.from) ** (step / RAMP_STEPS);
    const rate = step === RAMP_STEPS ? this.#silenceRate : (toRate(ramp.from * ratio) ?? ramp.from);
    if (this.#deps.write(media, rate)) this.#written = rate;
    else this.#unboost(media);
  }

  #unboost(media: HTMLMediaElement): void {
    this.#ramp = null;
    const restore = this.#deps.history.endBoost(media);
    if (restore === undefined) return;
    if (media.playbackRate === this.#written) this.#deps.write(media, restore);
    else this.#deps.released(media);
    this.#written = null;
    this.#deps.changed();
  }

  /** The page set the speed during a silence. */
  #rateChanged(media: HTMLMediaElement): void {
    if (this.#written === null || media.playbackRate === this.#written) return;
    const { history, write } = this.#deps;
    if (!history.isBoosted(media)) return;
    const page = media.playbackRate;
    // A second change in the same silence, or a speed already past the silence's: theirs stands.
    if (this.#pageChanged || page >= this.#silenceRate) {
      this.#unboost(media);
      return;
    }
    this.#pageChanged = true;
    if (!this.#deps.keepsBase(media)) history.rebaseBoost(media, page);
    this.#ramp = null;
    if (write(media, this.#silenceRate)) this.#written = this.#silenceRate;
    else this.#unboost(media);
    this.#deps.changed();
  }
}
