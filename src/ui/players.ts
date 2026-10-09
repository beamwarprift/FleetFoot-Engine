// How a player is named in the interface: a short name by kind and order of discovery, and its
// details (size, the site that embeds it, whether it plays); never anything else read from the
// page (titles, addresses).

import type { PlayerInfo } from '../core/messages/Protocol.ts';
import { isolate, type Translate } from './i18n.ts';

/** Between the parts of a player's details: a symbol, the same in every language. */
const SEPARATOR = ' · ';

/** Players in discovery order, so their numbers do not move when the ranking changes. */
export function playersInOrder(players: readonly PlayerInfo[]): PlayerInfo[] {
  return [...players].sort((a, b) => a.id - b.id);
}

/** «Video 2», «Audio 3». */
export function playerName(t: Translate, player: PlayerInfo, number: number): string {
  return t(player.kind === 'video' ? 'playerVideo' : 'playerAudio', String(number));
}

/** «640×360 · embedded from youtube.com · playing»: what tells this player from the others. */
export function playerDetails(t: Translate, player: PlayerInfo): string {
  const parts: string[] = [];
  // The size reads left to right in every language.
  if (player.kind === 'video') parts.push(isolate(`${player.width}×${player.height}`));
  if (player.frame !== null) {
    parts.push(
      player.frame.site === null
        ? t('playerEmbeddedUnknown')
        : t('playerEmbedded', player.frame.site),
    );
  }
  if (player.playing) parts.push(t('playerPlaying'));
  return parts.join(SEPARATOR);
}

/** The name and its details, as the list of players shows them. */
export function playerLabel(t: Translate, player: PlayerInfo, number: number): string {
  const details = playerDetails(t, player);
  const name = playerName(t, player, number);
  return details === '' ? name : `${name}${SEPARATOR}${details}`;
}
