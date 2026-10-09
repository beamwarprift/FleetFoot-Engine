import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/core/settings/Settings.ts';
import { commandForAction, settingForAction } from '../../../src/core/settings/ShortcutCommands.ts';
import { SHORTCUT_ACTIONS } from '../../../src/core/settings/Shortcuts.ts';
import { engineState } from '../state.ts';

const settings = {
  ...DEFAULT_SETTINGS,
  rateStep: 0.1,
  seekStep: 10,
  favoriteRate: DEFAULT_SETTINGS.favoriteRate,
};

describe('commandForAction', () => {
  it('steps, resets and seeks with the configured values', () => {
    const state = engineState();
    expect(commandForAction('slower', settings, state)).toEqual({
      v: 1,
      type: 'adjust-rate',
      delta: -0.1,
    });
    expect(commandForAction('faster', settings, state)).toEqual({
      v: 1,
      type: 'adjust-rate',
      delta: 0.1,
    });
    expect(commandForAction('reset', settings, state)).toEqual({ v: 1, type: 'reset-rate' });
    expect(commandForAction('favorite', settings, state)).toEqual({
      v: 1,
      type: 'set-rate',
      rate: 2,
    });
    expect(commandForAction('seek-backward', settings, state)).toEqual({
      v: 1,
      type: 'seek',
      seconds: -10,
    });
    expect(commandForAction('seek-forward', settings, state)).toEqual({
      v: 1,
      type: 'seek',
      seconds: 10,
    });
  });

  it('toggles from the current state', () => {
    expect(
      commandForAction(
        'loop-toggle',
        settings,
        engineState({ loop: { a: 1, b: 2, enabled: true } }),
      ),
    ).toEqual({ v: 1, type: 'loop-enable', enabled: false });
    expect(commandForAction('loop-toggle', settings, engineState({ loop: null }))).toEqual({
      v: 1,
      type: 'loop-enable',
      enabled: true,
    });
  });

  it('moves to the next player in discovery order, wrapping around', () => {
    const players = [3, 1, 2].map((id) => ({
      id,
      kind: 'video' as const,
      playing: false,
      width: 1,
      height: 1,
      frame: null,
    }));
    expect(
      commandForAction('next-player', settings, engineState({ players, activePlayerId: 1 })),
    ).toEqual({
      v: 1,
      type: 'select-player',
      playerId: 2,
    });
    expect(
      commandForAction('next-player', settings, engineState({ players, activePlayerId: 3 })),
    ).toEqual({
      v: 1,
      type: 'select-player',
      playerId: 1,
    });
    expect(commandForAction('next-player', settings, engineState())).toBeNull();
  });

  it('leaves the hold and the overlay to the caller', () => {
    expect(commandForAction('hold', settings, engineState())).toBeNull();
    expect(commandForAction('toggle-overlay', settings, engineState())).toBeNull();
    expect(commandForAction('toggle-pitch', settings, engineState())).toBeNull();
  });
});

describe('settingForAction', () => {
  it('toggles the natural voice setting, never the page alone', () => {
    expect(settingForAction('toggle-pitch', { ...settings, preservesPitch: true })).toEqual({
      key: 'preservesPitch',
      value: false,
    });
    expect(settingForAction('toggle-pitch', { ...settings, preservesPitch: false })).toEqual({
      key: 'preservesPitch',
      value: true,
    });
  });

  it('leaves every other action to the engine', () => {
    for (const action of SHORTCUT_ACTIONS.filter((name) => name !== 'toggle-pitch')) {
      expect(settingForAction(action, settings)).toBeNull();
    }
  });
});
