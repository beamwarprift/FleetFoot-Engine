// Deterministic choice of the active player from snapshots of the page's media.
// Lexicographic order, not a weighted sum: every decision can be explained by the first key
// that differs, and the discovery order makes the order total.

import type { MediaKind } from '../messages/Protocol.ts';

export interface PlayerSnapshot {
  readonly id: number;
  readonly kind: MediaKind;
  readonly connected: boolean;
  readonly playing: boolean;
  readonly ended: boolean;
  /** CSS px² of the element inside the viewport, 0 when hidden. */
  readonly visibleArea: number;
  /** Rendered box in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Not muted and volume above zero. */
  readonly audible: boolean;
  /** Seconds; NaN when unknown, Infinity for live streams. */
  readonly duration: number;
  /** Monotonic milliseconds of the last pointer or key interaction with this player. */
  readonly lastInteractionAt: number | null;
  /** Increases with every newly discovered element. */
  readonly discoveryOrder: number;
}

/**
 * Below this visible area a video counts as invisible: tracking pixels and collapsed players.
 * Heuristic, not yet measured on real sites (regression matrix).
 */
export const NEAR_ZERO_AREA_PX2 = 100;

/**
 * Media with a known duration below this are treated as previews or video-as-GIF loops.
 * Heuristic, not yet measured on real sites (regression matrix).
 */
export const SHORT_PREVIEW_SECONDS = 10;

export type Penalty = 'ended' | 'invisible' | 'short-preview';

export function penalties(player: PlayerSnapshot): Penalty[] {
  const found: Penalty[] = [];
  if (player.ended) found.push('ended');
  // An <audio> usually has no box at all: invisibility says nothing about it.
  if (player.kind === 'video' && player.visibleArea < NEAR_ZERO_AREA_PX2) found.push('invisible');
  if (
    Number.isFinite(player.duration) &&
    player.duration > 0 &&
    player.duration < SHORT_PREVIEW_SECONDS
  ) {
    found.push('short-preview');
  }
  return found;
}

type SortKey = readonly number[];

function sortKey(player: PlayerSnapshot): SortKey {
  return [
    player.connected ? 1 : 0,
    -penalties(player).length,
    player.playing ? 1 : 0,
    player.lastInteractionAt ?? Number.NEGATIVE_INFINITY,
    player.visibleArea >= NEAR_ZERO_AREA_PX2 ? 1 : 0,
    player.visibleArea,
    player.audible ? 1 : 0,
    player.discoveryOrder,
  ];
}

function compareDescending(a: SortKey, b: SortKey): number {
  for (let index = 0; index < a.length; index++) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return right - left > 0 ? 1 : -1;
  }
  return 0;
}

/** Best candidate first. */
export function rankPlayers(players: readonly PlayerSnapshot[]): PlayerSnapshot[] {
  const keyed = players.map((player) => ({ player, key: sortKey(player) }));
  keyed.sort((a, b) => compareDescending(a.key, b.key));
  return keyed.map(({ player }) => player);
}

/** An explicit choice wins while its player is still on the page; otherwise the best ranked. */
export function selectActive(
  ranked: readonly PlayerSnapshot[],
  pinnedId: number | null,
): { readonly player: PlayerSnapshot | null; readonly pinned: boolean } {
  if (pinnedId !== null) {
    const pinned = ranked.find((player) => player.id === pinnedId && player.connected);
    if (pinned !== undefined) return { player: pinned, pinned: true };
  }
  const best = ranked[0];
  return { player: best?.connected === true ? best : null, pinned: false };
}
