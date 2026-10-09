// Which players a command reaches: the active one, or every player on the page with «all
// players» (Protocol `Target`); a media the user pointed at by its address.

import type { Target } from '../messages/Protocol.ts';
import type { MediaRegistry } from './MediaRegistry.ts';
import type { PlayerSelection } from './PlayerSelection.ts';

export class CommandTargets {
  readonly #registry: MediaRegistry;
  readonly #selection: PlayerSelection;
  mode: Target = 'active';

  constructor(registry: MediaRegistry, selection: PlayerSelection) {
    this.#registry = registry;
    this.#selection = selection;
  }

  /** The player a step, a seek or a loop acts on. */
  active(): HTMLMediaElement | null {
    return this.#selection.active();
  }

  /** The players a rate or pitch change reaches. */
  all(): HTMLMediaElement[] {
    if (this.mode === 'all') return this.#registry.list().filter((media) => media.isConnected);
    const active = this.active();
    return active === null ? [] : [active];
  }

  /**
   * The media at `src` (the best ranked when several are), or every target with «all players»;
   * the usual targets when none is at that address.
   */
  at(src: string): HTMLMediaElement[] {
    if (this.mode === 'all') return this.all();
    const { elements, ranked } = this.#selection.rank();
    for (const player of ranked) {
      const media = elements.get(player.id);
      if (media?.isConnected && (media.currentSrc === src || media.src === src)) return [media];
    }
    return this.all();
  }
}
