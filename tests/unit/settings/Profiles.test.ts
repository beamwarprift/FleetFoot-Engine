import { describe, expect, it } from 'vitest';
import type { Rate } from '../../../src/core/media/PlaybackRate.ts';
import { DEFAULT_MEMORY } from '../../../src/core/settings/Memory.ts';
import {
  effectiveSettings,
  isEmptyProfile,
  isProfileSetting,
  parseRememberedRate,
  parseSiteProfile,
  siteOfStorageKey,
  siteStorageKey,
  startingRate,
} from '../../../src/core/settings/Profiles.ts';
import {
  DEFAULT_SETTINGS,
  MAX_EXCLUDED_SITES,
  parseSettings,
} from '../../../src/core/settings/Settings.ts';

const rate = (value: number) => value as Rate;

describe('site profiles', () => {
  it('are read field by field: an invalid field is dropped, the others stay', () => {
    expect(
      parseSiteProfile({
        playbackRate: 1.75,
        preservesPitch: false,
        seekStep: 2.5,
        ratePolicy: 'loud',
        lockFight: 'fight',
        overlayEnabled: false,
        holdRate: 'fast',
        skipSilence: 'yes',
        title: 'what was watched',
      }),
    ).toEqual({ playbackRate: 1.75, preservesPitch: false, overlayEnabled: false });
    expect(parseSiteProfile({ skipSilence: true })).toEqual({ skipSilence: true });
    expect(parseSiteProfile({ lockFight: 'unbraked' })).toEqual({ lockFight: 'unbraked' });
    for (const stored of [undefined, null, 'x', [1]]) expect(parseSiteProfile(stored)).toEqual({});
  });

  it('keep a remembered speed on the 0.01 grid inside the range', () => {
    expect(parseSiteProfile({ playbackRate: 99 }).playbackRate).toBe(16);
    expect(parseRememberedRate(Number.NaN)).toBeNull();
    expect(parseRememberedRate('2')).toBeNull();
  });

  it('live under one storage key per site, and only valid sites', () => {
    expect(siteStorageKey('youtube.com')).toBe('site:youtube.com');
    expect(siteOfStorageKey('site:youtube.com')).toBe('youtube.com');
    for (const key of ['site:', 'site:WWW.X.COM', 'rememberedRate', 'theme', 'site:a b']) {
      expect(siteOfStorageKey(key)).toBeNull();
    }
  });

  it('win over the general settings only for the fields they set', () => {
    const settings = effectiveSettings(DEFAULT_SETTINGS, {
      preservesPitch: false,
      ratePolicy: 'lock',
      lockFight: 'braked',
    });
    expect(settings.preservesPitch).toBe(false);
    expect(settings.ratePolicy).toBe('lock');
    expect(settings.lockFight).toBe('braked');
    expect(settings.seekStep).toBe(DEFAULT_SETTINGS.seekStep);
    expect(isEmptyProfile({})).toBe(true);
    expect(isEmptyProfile({ seekStep: 10 })).toBe(false);
  });

  it('name the settings a page change saves per site', () => {
    expect(isProfileSetting('preservesPitch')).toBe(true);
    expect(isProfileSetting('skipSilence')).toBe(true);
    expect(isProfileSetting('silenceRate')).toBe(false);
    expect(isProfileSetting('theme')).toBe(false);
    expect(isProfileSetting('playbackRate')).toBe(false);
  });
});

describe('memory', () => {
  it('remembers one speed for every site by default', () => {
    expect(DEFAULT_MEMORY).toBe('global');
    expect(DEFAULT_SETTINGS.memory).toBe('global');
  });

  it('starts a page at the speed its mode remembers, or leaves the site its own', () => {
    expect(startingRate('none', rate(2), { playbackRate: rate(3) })).toBeNull();
    expect(startingRate('global', rate(2), { playbackRate: rate(3) })).toBe(2);
    expect(startingRate('global', null, {})).toBeNull();
    expect(startingRate('site', rate(2), { playbackRate: rate(3) })).toBe(3);
    expect(startingRate('site', rate(2), {})).toBeNull();
  });
});

describe('excluded sites', () => {
  it('are a list of valid sites, duplicates removed, within the bound', () => {
    expect(
      parseSettings({ excludedSites: ['bank.com', 'bank.com', 'mail.com'] }).excludedSites,
    ).toEqual(['bank.com', 'mail.com']);
    for (const value of [
      ['bank.com', 'https://bad.com'],
      ['WWW.BANK.COM'],
      'bank.com',
      Array.from({ length: MAX_EXCLUDED_SITES + 1 }, (_, index) => `s${index}.com`),
    ]) {
      expect(parseSettings({ excludedSites: value }).excludedSites).toEqual([]);
    }
    expect(parseSettings({ memory: 'forever' }).memory).toBe('global');
  });
});
