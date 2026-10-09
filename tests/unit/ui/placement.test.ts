import { describe, expect, it } from 'vitest';
import {
  fits,
  OVERLAY_INSET,
  placeOverlay,
  positionAt,
} from '../../../src/page/overlay/placement.ts';

const player = { left: 100, top: 50, width: 640, height: 360 };
const overlay = { left: 0, top: 0, width: 200, height: 30 };

describe('overlay placement', () => {
  it('starts in the top-left corner inside the player', () => {
    expect(placeOverlay(player, overlay, { x: 0, y: 0 })).toEqual({
      x: 100 + OVERLAY_INSET,
      y: 50 + OVERLAY_INSET,
    });
  });

  it('reaches the opposite corner without leaving the player', () => {
    const { x, y } = placeOverlay(player, overlay, { x: 1, y: 1 });
    expect(x + overlay.width).toBe(player.left + player.width - OVERLAY_INSET);
    expect(y + overlay.height).toBe(player.top + player.height - OVERLAY_INSET);
  });

  it('turns a dropped position back into the same fraction', () => {
    for (const position of [
      { x: 0.25, y: 0.75 },
      { x: 1, y: 0 },
      { x: 0.5, y: 0.5 },
    ]) {
      const { x, y } = placeOverlay(player, overlay, position);
      const back = positionAt(player, overlay, x, y);
      expect(back.x).toBeCloseTo(position.x, 10);
      expect(back.y).toBeCloseTo(position.y, 10);
    }
  });

  it('keeps a drop outside the player at its edge, and a player smaller than the overlay at 0', () => {
    expect(positionAt(player, overlay, -500, 5000)).toEqual({ x: 0, y: 1 });
    const tiny = { left: 0, top: 0, width: 100, height: 20 };
    expect(positionAt(tiny, overlay, 50, 50)).toEqual({ x: 0, y: 0 });
    expect(placeOverlay(tiny, overlay, { x: 1, y: 1 })).toEqual({
      x: OVERLAY_INSET,
      y: OVERLAY_INSET,
    });
  });
});

describe('fits', () => {
  const viewport = { width: 1280, height: 900 };

  it('accepts a visible player that holds the overlay', () => {
    expect(fits(player, overlay, viewport)).toBe(true);
  });

  it('refuses a player too small for it, by width or by height', () => {
    expect(
      fits({ ...player, width: overlay.width + 2 * OVERLAY_INSET - 1 }, overlay, viewport),
    ).toBe(false);
    expect(
      fits({ ...player, height: overlay.height + 2 * OVERLAY_INSET - 1 }, overlay, viewport),
    ).toBe(false);
    expect(fits({ ...player, width: overlay.width + 2 * OVERLAY_INSET }, overlay, viewport)).toBe(
      true,
    );
  });

  it('refuses a player scrolled out of the viewport on any side', () => {
    expect(fits({ ...player, top: -player.height }, overlay, viewport)).toBe(false);
    expect(fits({ ...player, top: viewport.height }, overlay, viewport)).toBe(false);
    expect(fits({ ...player, left: -player.width }, overlay, viewport)).toBe(false);
    expect(fits({ ...player, left: viewport.width }, overlay, viewport)).toBe(false);
    expect(fits({ ...player, top: -player.height + 1 }, overlay, viewport)).toBe(true);
  });
});
