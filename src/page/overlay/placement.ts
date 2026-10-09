// Where the overlay sits on its player: a fraction of the free space inside the player's box, so
// the same position works for any player size. Pure geometry.

import type { OverlayPosition } from '../../core/settings/Settings.ts';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A measured rectangle (a `DOMRect`) as a plain box. */
export function toBox(rect: Box): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** Distance from the player's edges in the default corner, in CSS pixels. Chosen value. */
export const OVERLAY_INSET = 8;

/** Top-left corner, just inside the player. */
export const DEFAULT_POSITION: OverlayPosition = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Top-left corner of the overlay, in viewport coordinates. */
export function placeOverlay(
  player: Box,
  overlay: Box,
  position: OverlayPosition,
): { x: number; y: number } {
  const freeX = Math.max(0, player.width - overlay.width - 2 * OVERLAY_INSET);
  const freeY = Math.max(0, player.height - overlay.height - 2 * OVERLAY_INSET);
  return {
    x: player.left + OVERLAY_INSET + clamp(position.x, 0, 1) * freeX,
    y: player.top + OVERLAY_INSET + clamp(position.y, 0, 1) * freeY,
  };
}

/** The position an overlay dragged to (x, y) stands for inside the player. */
export function positionAt(player: Box, overlay: Box, x: number, y: number): OverlayPosition {
  const freeX = player.width - overlay.width - 2 * OVERLAY_INSET;
  const freeY = player.height - overlay.height - 2 * OVERLAY_INSET;
  return {
    x: freeX > 0 ? clamp((x - player.left - OVERLAY_INSET) / freeX, 0, 1) : 0,
    y: freeY > 0 ? clamp((y - player.top - OVERLAY_INSET) / freeY, 0, 1) : 0,
  };
}

/**
 * The overlay is shown only on a player that holds it and is on screen: never over the page on a
 * tiny, hidden or scrolled-away player.
 */
export function fits(
  player: Box,
  overlay: Box,
  viewport: { width: number; height: number },
): boolean {
  const roomy =
    player.width >= overlay.width + 2 * OVERLAY_INSET &&
    player.height >= overlay.height + 2 * OVERLAY_INSET;
  const onScreen =
    player.left < viewport.width &&
    player.top < viewport.height &&
    player.left + player.width > 0 &&
    player.top + player.height > 0;
  return roomy && onScreen;
}

export function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
}
