import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MAX_PRESETS,
  migrateSettings,
  parseSettings,
  SETTING_KEYS,
  SETTINGS_VERSION,
  VERSION_KEY,
  validSetting,
} from '../../../src/core/settings/Settings.ts';
import { DEFAULT_BINDINGS } from '../../../src/core/settings/Shortcuts.ts';

describe('parseSettings', () => {
  it('gives the defaults for nothing stored, or for storage that is not an object', () => {
    for (const stored of [undefined, null, 42, 'x', [], {}]) {
      expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('starts from the specification defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      presets: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4],
      holdRate: 3,
      seekStep: 5,
      preservesPitch: true,
      ratePolicy: 'smart',
      lockFight: 'yield',
      target: 'active',
      contextMenu: true,
      skipSilence: false,
      silenceMode: 'normal',
      silenceRate: 5,
    });
  });

  it('keeps every valid stored value', () => {
    const stored = {
      presets: [3, 1, 2],
      rateStep: 0.1,
      favoriteRate: 1.75,
      holdRate: 2.5,
      seekStep: 30,
      preservesPitch: false,
      ratePolicy: 'lock',
      lockFight: 'braked',
      target: 'all',
      overlayEnabled: false,
      overlayPosition: { x: 1, y: 0.5 },
      contextMenu: false,
      pageShortcuts: false,
      skipSilence: true,
      silenceMode: 'aggressive',
      silenceRate: 3.5,
    };
    expect(parseSettings(stored)).toMatchObject({ ...stored, presets: [1, 2, 3] });
  });

  it('reads what an older or a newer build left: missing settings default, unknown keys ignored', () => {
    const parsed = parseSettings({
      [VERSION_KEY]: SETTINGS_VERSION + 1,
      rateStep: 0.5,
      settingFromTheFuture: { nested: true },
      'site:a.example': { playbackRate: 2 },
      timeSaved: 120,
    });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, rateStep: 0.5 });
  });

  it('replaces each invalid value by its default, leaving the valid ones', () => {
    const parsed = parseSettings({
      presets: 'fast',
      rateStep: 2,
      favoriteRate: Number.NaN,
      holdRate: '3',
      seekStep: 2.5,
      preservesPitch: 'yes',
      ratePolicy: 'always',
      lockFight: 'Unbraked',
      target: 'some',
      overlayEnabled: 1,
      overlayPosition: { x: 2, y: 0 },
      contextMenu: null,
      pageShortcuts: false,
      skipSilence: 'on',
      silenceMode: 'Normal',
      silenceRate: '5',
    });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, pageShortcuts: false });
  });

  it('clamps rates to the offered range and the 0.01 grid', () => {
    expect(parseSettings({ favoriteRate: 99, holdRate: 0.01, silenceRate: 20 })).toMatchObject({
      favoriteRate: 16,
      holdRate: 0.1,
      silenceRate: 16,
    });
  });

  it('orders and deduplicates presets, and refuses empty or oversized lists', () => {
    expect(parseSettings({ presets: [2, 1, 2, 1.006] }).presets).toEqual([1, 1.01, 2]);
    expect(parseSettings({ presets: [] }).presets).toEqual(DEFAULT_SETTINGS.presets);
    const tooMany = Array.from({ length: MAX_PRESETS + 1 }, (_, index) => 1 + index / 10);
    expect(parseSettings({ presets: tooMany }).presets).toEqual(DEFAULT_SETTINGS.presets);
    expect(parseSettings({ presets: [1, 'x'] }).presets).toEqual(DEFAULT_SETTINGS.presets);
  });

  it('bounds the rate step and the seek step', () => {
    expect(validSetting('rateStep', 0.01)).toBe(0.01);
    expect(validSetting('rateStep', 1)).toBe(1);
    expect(validSetting('rateStep', 0.004)).toBeUndefined();
    expect(validSetting('rateStep', 1.01)).toBeUndefined();
    expect(validSetting('seekStep', 1)).toBe(1);
    expect(validSetting('seekStep', 3600)).toBe(3600);
    expect(validSetting('seekStep', 0)).toBeUndefined();
    expect(validSetting('seekStep', 3601)).toBeUndefined();
  });

  it('takes the text size in tenths from 100% to 200%, and nothing else', () => {
    expect(DEFAULT_SETTINGS.textSize).toBe(100);
    for (const size of [100, 110, 150, 190, 200]) expect(validSetting('textSize', size)).toBe(size);
    for (const size of [90, 99, 105, 101, 210, 1000, 150.5, Number.NaN, '150', null, -100]) {
      expect(validSetting('textSize', size)).toBeUndefined();
    }
    expect(parseSettings({ textSize: 160 }).textSize).toBe(160);
    expect(parseSettings({ textSize: 155 }).textSize).toBe(100);
  });

  it('accepts the overlay corner (null) or a position inside the player', () => {
    expect(validSetting('overlayPosition', null)).toBeNull();
    expect(validSetting('overlayPosition', { x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
    expect(validSetting('overlayPosition', { x: -0.1, y: 0 })).toBeUndefined();
    expect(validSetting('overlayPosition', [0, 0])).toBeUndefined();
  });

  it('ignores keys that are not settings', () => {
    expect(Object.keys(parseSettings({ other: 1, [VERSION_KEY]: 1 }))).toEqual([...SETTING_KEYS]);
  });

  it('reads the bindings action by action', () => {
    expect(parseSettings({ bindings: { slower: null } }).bindings).toEqual({
      ...DEFAULT_BINDINGS,
      slower: null,
    });
  });
});

describe('migrateSettings', () => {
  it('records the version on a first install and on an older layout', () => {
    expect(migrateSettings({})).toEqual({ writes: { [VERSION_KEY]: SETTINGS_VERSION } });
    expect(migrateSettings({ [VERSION_KEY]: 0 })).toEqual({
      writes: { [VERSION_KEY]: SETTINGS_VERSION },
    });
  });

  it('reads a corrupt version as the first layout, and storage that is not an object too', () => {
    for (const version of ['1', null, -1, [], {}, true]) {
      expect(migrateSettings({ [VERSION_KEY]: version })).toEqual({
        writes: { [VERSION_KEY]: SETTINGS_VERSION },
      });
    }
    for (const stored of [undefined, null, 'x', [1]]) {
      expect(migrateSettings(stored)).toEqual({ writes: { [VERSION_KEY]: SETTINGS_VERSION } });
    }
  });

  it('leaves the current and newer layouts untouched', () => {
    expect(migrateSettings({ [VERSION_KEY]: SETTINGS_VERSION })).toEqual({ writes: {} });
    expect(migrateSettings({ [VERSION_KEY]: SETTINGS_VERSION + 1 })).toEqual({ writes: {} });
  });
});
