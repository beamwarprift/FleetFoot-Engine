// What each shortcut action does, shared by the page's shortcuts and the browser's: a saved
// setting (the same one the popup and the options change, so every way of changing it agrees)
// or a command to the engine. Engine toggles read the current state; `hold` and `toggle-overlay`
// are handled by the caller (a hold needs the key release, the overlay lives in the page).

import { type Command, type EngineState, makeCommand } from '../messages/Protocol.ts';
import type { SettingKey, Settings } from './Settings.ts';
import type { ShortcutAction } from './Shortcuts.ts';

/** One setting and its new value; checked again when saved, like any other value. */
export interface SettingChange<K extends SettingKey = SettingKey> {
  readonly key: K;
  readonly value: Settings[K];
}

/** The setting an action changes, or null for an action that sends a command. */
export function settingForAction(action: ShortcutAction, settings: Settings): SettingChange | null {
  return action === 'toggle-pitch'
    ? { key: 'preservesPitch', value: !settings.preservesPitch }
    : null;
}

/** Actions that make sense again while the key auto-repeats. */
export const REPEATABLE_ACTIONS: ReadonlySet<ShortcutAction> = new Set([
  'slower',
  'faster',
  'seek-backward',
  'seek-forward',
]);

/** The player after the active one, in discovery order, wrapping around. */
function nextPlayerId(state: EngineState): number | null {
  const ids = state.players.map((player) => player.id).sort((a, b) => a - b);
  if (ids.length < 2) return null;
  const index = state.activePlayerId === null ? -1 : ids.indexOf(state.activePlayerId);
  return ids[(index + 1) % ids.length] ?? null;
}

export function commandForAction(
  action: ShortcutAction,
  settings: Settings,
  state: EngineState,
): Command | null {
  switch (action) {
    case 'slower':
      return makeCommand('adjust-rate', { delta: -settings.rateStep });
    case 'faster':
      return makeCommand('adjust-rate', { delta: settings.rateStep });
    case 'reset':
      return makeCommand('reset-rate', {});
    case 'favorite':
      return makeCommand('set-rate', { rate: settings.favoriteRate });
    case 'seek-backward':
      return makeCommand('seek', { seconds: -settings.seekStep });
    case 'seek-forward':
      return makeCommand('seek', { seconds: settings.seekStep });
    case 'loop-a':
      return makeCommand('loop-set-a', {});
    case 'loop-b':
      return makeCommand('loop-set-b', {});
    case 'loop-toggle':
      return makeCommand('loop-enable', { enabled: state.loop?.enabled !== true });
    case 'next-player': {
      const playerId = nextPlayerId(state);
      return playerId === null ? null : makeCommand('select-player', { playerId });
    }
    case 'hold':
    case 'toggle-overlay':
    case 'toggle-pitch':
      return null;
  }
}
