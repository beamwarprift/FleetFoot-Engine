// The speed of the target players: a deliberate change, a step, the previous speed, the speed
// remembered for the site, and a hold that puts every player back as it was. The pitch setting
// travels with every change, since a site may have reset it.

import type { ErrorCode } from '../messages/Protocol.ts';
import { applyPreservesPitch } from './PitchController.ts';
import { type Rate, toRate } from './PlaybackRate.ts';
import type { RateHistory } from './RateHistory.ts';
import type { RatePolicy } from './RatePolicy.ts';

export interface RateControlDeps {
  /** Writes a rate and tells whether the element took it. */
  readonly write: (media: HTMLMediaElement, rate: number) => boolean;
  readonly history: RateHistory;
  readonly policy: RatePolicy;
  /** The players a command applies to now. */
  targets(): HTMLMediaElement[];
  /** The player a step or «previous» starts from. */
  active(): HTMLMediaElement | null;
  preservesPitch(): boolean;
}

/** Each command answers with the error to report, or null when it was applied. */
export class RateControl {
  readonly #deps: RateControlDeps;

  constructor(deps: RateControlDeps) {
    this.#deps = deps;
  }

  /**
   * A deliberate change: it ends any hold without restoring, and remembers where it came from.
   * The usual targets unless the caller names them.
   */
  set(rate: Rate, targets: HTMLMediaElement[] = this.#deps.targets()): ErrorCode | null {
    const { history, policy } = this.#deps;
    if (targets.length === 0) return 'no-player';
    const origins = targets.map((media) => history.baseRate(media));
    history.endHolds();
    // A silence being skipped ends here: the new rate replaces the one it would have restored.
    for (const media of targets) history.endBoost(media);
    let applied = true;
    targets.forEach((media, index) => {
      applyPreservesPitch(media, this.#deps.preservesPitch());
      if (this.#deps.write(media, rate)) history.record(media, origins[index] ?? rate, rate);
      else applied = false;
    });
    if (!applied) return 'rate-rejected';
    policy.chose(rate, targets);
    return null;
  }

  /**
   * The speed remembered for the site. A choice already made on the page wins; a target present
   * now gets it as a choice (so «previous» goes back to the site's own speed); otherwise the first
   * media that becomes the target gets it.
   */
  setDefault(rate: Rate): ErrorCode | null {
    if (this.#deps.policy.desired !== null) return null;
    if (this.#deps.targets().length > 0) return this.set(rate);
    this.#deps.policy.start(rate);
    return null;
  }

  /** With several targets, the step starts from the active player and all get the same rate. */
  adjust(delta: number): ErrorCode | null {
    const active = this.#deps.active();
    if (active === null) return 'no-player';
    const rate = toRate(this.#deps.history.baseRate(active) + delta);
    return rate === null ? 'rate-rejected' : this.set(rate);
  }

  previous(): ErrorCode | null {
    const active = this.#deps.active();
    if (active === null) return 'no-player';
    const previous = this.#deps.history.previous(active);
    return previous === null ? 'no-previous-rate' : this.set(previous);
  }

  holdStart(rate: Rate): ErrorCode | null {
    const { history } = this.#deps;
    // Keyboard autorepeat sends hold-start again: the saved rates must stay the pre-hold ones.
    if (history.holding()) return null;
    const targets = this.#deps.targets();
    if (targets.length === 0) return 'no-player';
    for (const media of targets) {
      // The hold starts from the player's own rate, not from a silence's.
      const outside = history.endBoost(media);
      if (outside !== undefined) this.#deps.write(media, outside);
      history.startHold(media);
      applyPreservesPitch(media, this.#deps.preservesPitch());
      if (!this.#deps.write(media, rate)) {
        this.restoreHolds();
        return 'rate-rejected';
      }
    }
    return null;
  }

  /**
   * Restores every held element, even when the active player changed meanwhile, and also one the
   * site took out of the page: it may come back.
   */
  restoreHolds(): void {
    const { history, write } = this.#deps;
    for (const [media, restore] of history.endHolds()) write(media, restore);
  }
}
