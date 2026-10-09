// Which player the commands act on: the user's explicit choice while it stays on the page,
// otherwise the best-ranked player (MediaSelector) from a snapshot measured now.

import { isVideoElement } from './dom.ts';
import { framedSites } from './FramedSites.ts';
import type { InteractionTracker } from './InteractionTracker.ts';
import type { MediaRegistry } from './MediaRegistry.ts';
import { type PlayerSnapshot, rankPlayers, selectActive } from './MediaSelector.ts';
import { measurePlayer, type Viewport } from './PlayerMeasure.ts';

export interface PlayerSelectionDeps {
  readonly registry: MediaRegistry;
  readonly interactions: InteractionTracker;
  readonly viewport: () => Viewport;
  /** The site of the page, reported with the state. */
  readonly site?: string | null;
}

export interface Ranking {
  readonly elements: ReadonlyMap<number, HTMLMediaElement>;
  readonly ranked: readonly PlayerSnapshot[];
  readonly active: PlayerSnapshot | null;
  readonly pinned: boolean;
  /** With no player: the frames from other sites where one may be (Protocol `framedSites`). */
  readonly framedSites: readonly string[];
}

export class PlayerSelection {
  readonly #deps: PlayerSelectionDeps;
  #pinnedId: number | null = null;

  constructor(deps: PlayerSelectionDeps) {
    this.#deps = deps;
  }

  /** Pins a connected player, or returns to automatic selection with `null`. */
  select(playerId: number | null): boolean {
    if (playerId !== null && this.#deps.registry.byId(playerId) === undefined) return false;
    this.#pinnedId = playerId;
    return true;
  }

  active(): HTMLMediaElement | null {
    const { elements, active } = this.rank();
    return active === null ? null : (elements.get(active.id) ?? null);
  }

  rank(): Ranking {
    const { registry, interactions } = this.#deps;
    const viewport = this.#deps.viewport();
    const elements = new Map<number, HTMLMediaElement>();
    const snapshots: PlayerSnapshot[] = [];
    for (const media of registry.list()) {
      const id = registry.idOf(media);
      if (id === undefined) continue;
      elements.set(id, media);
      const measure = measurePlayer(media, viewport);
      snapshots.push({
        id,
        kind: isVideoElement(media) ? 'video' : 'audio',
        connected: media.isConnected,
        playing: !media.paused && !media.ended,
        ended: media.ended,
        visibleArea: measure.visibleArea,
        width: measure.width,
        height: measure.height,
        audible: !media.muted && media.volume > 0,
        duration: media.duration,
        lastInteractionAt: interactions.lastInteraction(media),
        discoveryOrder: id,
      });
    }
    const ranked = rankPlayers(snapshots);
    const { player, pinned } = selectActive(ranked, this.#pinnedId);
    const framed =
      ranked.length > 0 ? [] : framedSites(registry.trees(), this.#deps.site ?? null, viewport);
    return { elements, ranked, active: player, pinned, framedSites: framed };
  }
}
