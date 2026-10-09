import { describe, expect, it } from 'vitest';
import type { Rate } from '../../../src/core/media/PlaybackRate.ts';
import { configCommands } from '../../../src/core/settings/EngineConfig.ts';
import { DEFAULT_SETTINGS } from '../../../src/core/settings/Settings.ts';

describe('configCommands', () => {
  it('sends every engine setting the first time', () => {
    expect(configCommands(null, DEFAULT_SETTINGS)).toEqual([
      { v: 1, type: 'set-rate-policy', policy: 'smart' },
      { v: 1, type: 'set-lock-fight', fight: 'yield' },
      { v: 1, type: 'set-skip-silence', enabled: false, mode: 'normal', silenceRate: 5 },
      { v: 1, type: 'set-target', target: 'active' },
      { v: 1, type: 'set-preserves-pitch', enabled: true },
    ]);
  });

  it('then only what changed, so a choice made for the page is not undone', () => {
    expect(
      configCommands(DEFAULT_SETTINGS, {
        ...DEFAULT_SETTINGS,
        holdRate: DEFAULT_SETTINGS.favoriteRate,
      }),
    ).toEqual([]);
    expect(configCommands(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ratePolicy: 'lock' })).toEqual([
      { v: 1, type: 'set-rate-policy', policy: 'lock' },
    ]);
    expect(configCommands(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, lockFight: 'braked' })).toEqual([
      { v: 1, type: 'set-lock-fight', fight: 'braked' },
    ]);
    expect(
      configCommands(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, preservesPitch: false }),
    ).toEqual([{ v: 1, type: 'set-preserves-pitch', enabled: false }]);
  });

  it('sends Skip Silence whole when its switch, its mode or its speed changes', () => {
    const silence = (enabled: boolean, mode: string, silenceRate: number) => [
      { v: 1, type: 'set-skip-silence', enabled, mode, silenceRate },
    ];
    const configAfter = (changes: Partial<typeof DEFAULT_SETTINGS>) =>
      configCommands(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...changes });
    expect(configAfter({ skipSilence: true })).toEqual(silence(true, 'normal', 5));
    expect(configAfter({ silenceMode: 'conservative' })).toEqual(silence(false, 'conservative', 5));
    expect(configAfter({ silenceRate: 2.5 as Rate })).toEqual(silence(false, 'normal', 2.5));
  });
});
