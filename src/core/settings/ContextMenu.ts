// What the right-click menu on video and audio offers and does: one item per menu speed and the
// favorite, each turned into a command for the media the user clicked.

import { MENU_RATES } from '../media/Presets.ts';
import { type Command, MAX_MEDIA_SRC_LENGTH, makeCommand } from '../messages/Protocol.ts';
import type { Settings } from './Settings.ts';

export const MENU_PARENT = 'speed';
export const MENU_FAVORITE = 'speed-favorite';
const MENU_RATE_PREFIX = 'speed-';

/** The id of the item for one of `MENU_RATES`. */
export function menuRateId(rate: number): string {
  return `${MENU_RATE_PREFIX}${rate}`;
}

/** The rate a menu item stands for, or null for an item that is not ours. */
export function menuRate(itemId: string | number, settings: Settings): number | null {
  if (itemId === MENU_FAVORITE) return settings.favoriteRate;
  if (typeof itemId !== 'string' || !itemId.startsWith(MENU_RATE_PREFIX)) return null;
  const rate = Number(itemId.slice(MENU_RATE_PREFIX.length));
  return MENU_RATES.includes(rate) ? rate : null;
}

/**
 * The command for the clicked media: by its address when the browser gives one the protocol can
 * carry, otherwise for the active player.
 */
export function menuCommand(rate: number, srcUrl: string | undefined): Command {
  return srcUrl !== undefined && srcUrl !== '' && srcUrl.length <= MAX_MEDIA_SRC_LENGTH
    ? makeCommand('set-media-rate', { src: srcUrl, rate })
    : makeCommand('set-rate', { rate });
}
