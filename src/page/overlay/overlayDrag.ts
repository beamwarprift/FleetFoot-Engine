// Moving the overlay on its player: dragged by its handle, or moved with the arrow keys as the
// keyboard alternative to dragging (WCAG 2.5.7). The place is saved as a share of the player's
// free space, so it holds at every size.

import type { OverlayPosition } from '../../core/settings/Settings.ts';
import { type Box, DEFAULT_POSITION, positionAt, toBox } from './placement.ts';

/** Keyboard move of the drag handle, as a fraction of the free space. Chosen value. */
const KEY_MOVE = 0.05;

const KEY_MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEY_MOVE, 0],
  ArrowRight: [KEY_MOVE, 0],
  ArrowUp: [0, -KEY_MOVE],
  ArrowDown: [0, KEY_MOVE],
};

export interface DragDeps {
  readonly bar: HTMLElement;
  /** The player's box, or null without a player. */
  box(): Box | null;
  moveTo(x: number, y: number): void;
  position(): OverlayPosition | null;
  save(position: OverlayPosition): void;
}

export function overlayDrag(deps: DragDeps) {
  let dragging: { dx: number; dy: number } | null = null;
  return {
    isDragging: (): boolean => dragging !== null,

    start(event: PointerEvent, handle: HTMLElement): void {
      const bar = deps.bar.getBoundingClientRect();
      dragging = { dx: event.clientX - bar.left, dy: event.clientY - bar.top };
      handle.setPointerCapture(event.pointerId);
      const abort = new AbortController();
      handle.addEventListener(
        'pointermove',
        (move) => {
          const drag = dragging;
          if (drag !== null)
            deps.moveTo(
              (move as PointerEvent).clientX - drag.dx,
              (move as PointerEvent).clientY - drag.dy,
            );
        },
        { signal: abort.signal },
      );
      const end = (up: Event): void => {
        abort.abort();
        const drag = dragging;
        dragging = null;
        const player = deps.box();
        if (drag === null || player === null) return;
        const pointer = up as PointerEvent;
        const overlay = toBox(deps.bar.getBoundingClientRect());
        deps.save(
          positionAt(player, overlay, pointer.clientX - drag.dx, pointer.clientY - drag.dy),
        );
      };
      handle.addEventListener('pointerup', end, { signal: abort.signal });
      handle.addEventListener('pointercancel', end, { signal: abort.signal });
    },

    keyMove(event: KeyboardEvent): void {
      const move = KEY_MOVES[event.key];
      if (move === undefined) return;
      event.preventDefault();
      const current = deps.position() ?? DEFAULT_POSITION;
      const clamp = (value: number) => Math.min(1, Math.max(0, value));
      deps.save({ x: clamp(current.x + move[0]), y: clamp(current.y + move[1]) });
    },
  };
}
