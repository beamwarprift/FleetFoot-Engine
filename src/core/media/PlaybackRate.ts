// Playback-rate domain: the range the product offers and the 0.01 grid the interface shows.

// The product's range. A browser may refuse part of it: every write is read back by the caller.
export const MIN_RATE = 0.1;
export const MAX_RATE = 16;

declare const rateBrand: unique symbol;

/** A rate inside [MIN_RATE, MAX_RATE] on the 0.01 grid. Built only by `toRate`. */
export type Rate = number & { readonly [rateBrand]: true };

/** Rounds to hundredths so the rate applied is exactly the rate displayed. */
export function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamps a finite number into the offered range on the 0.01 grid; non-finite input is not a rate. */
export function toRate(value: number): Rate | null {
  if (!Number.isFinite(value)) return null;
  return roundToHundredths(Math.min(MAX_RATE, Math.max(MIN_RATE, value))) as Rate;
}

/** Always two decimals: 0.10×, 1.00×, 16.00×. */
export function formatRate(rate: number): string {
  return `${rate.toFixed(2)}×`;
}
