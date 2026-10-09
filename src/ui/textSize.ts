// The size the user chose for the text of the options page, applied as a zoom: text, icons,
// controls and the room between them grow together, so the page keeps its proportions and a
// control keeps fitting its label.

import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, TEXT_SIZE_STEP } from '../core/settings/Settings.ts';

/** Every size the setting accepts, smallest first. */
export const TEXT_SIZES: readonly number[] = Array.from(
  { length: (MAX_TEXT_SIZE - MIN_TEXT_SIZE) / TEXT_SIZE_STEP + 1 },
  (_, index) => MIN_TEXT_SIZE + index * TEXT_SIZE_STEP,
);

/** Sets the size on the page: its root zooms by the size as a factor. */
export function applyTextSize(root: HTMLElement, size: number): void {
  root.style.setProperty('zoom', String(size / 100));
}
