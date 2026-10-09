// The remembered speed and the site profiles. A profile holds only settings, never
// what was watched; each site has its own storage key, so two tabs on different sites never
// overwrite each other. Profiles count only with memory `site`.

import type { Rate } from '../media/PlaybackRate.ts';
import type { MemoryMode } from './Memory.ts';
import { type Settings, validSetting } from './Settings.ts';
import { siteOf } from './Sites.ts';

/** The speed remembered for every site, with memory `global`. */
export const REMEMBERED_RATE_KEY = 'rememberedRate';

/** Every site profile lives under this prefix plus the site. */
export const SITE_KEY_PREFIX = 'site:';

/** What a site's profile may set; every field is optional and wins on that site only. */
export interface SiteProfile {
  readonly playbackRate?: Rate;
  readonly preservesPitch?: boolean;
  readonly seekStep?: number;
  readonly holdRate?: Rate;
  readonly overlayEnabled?: boolean;
  readonly ratePolicy?: Settings['ratePolicy'];
  readonly lockFight?: Settings['lockFight'];
  readonly skipSilence?: Settings['skipSilence'];
}

/** The profile fields that are settings too, read with the same rules as the settings. */
const SETTING_FIELDS = [
  'preservesPitch',
  'seekStep',
  'holdRate',
  'overlayEnabled',
  'ratePolicy',
  'lockFight',
  'skipSilence',
] as const satisfies readonly (keyof SiteProfile & keyof Settings)[];

export type ProfileSetting = (typeof SETTING_FIELDS)[number];

export function isProfileSetting(key: string): key is ProfileSetting {
  return (SETTING_FIELDS as readonly string[]).includes(key);
}

export type ProfileField = keyof SiteProfile;
export const PROFILE_FIELDS: readonly ProfileField[] = ['playbackRate', ...SETTING_FIELDS];

export function siteStorageKey(site: string): string {
  return `${SITE_KEY_PREFIX}${site}`;
}

/** The site a storage key belongs to, or null for a key that is not a valid site profile key. */
export function siteOfStorageKey(key: string): string | null {
  if (!key.startsWith(SITE_KEY_PREFIX)) return null;
  const site = key.slice(SITE_KEY_PREFIX.length);
  return siteOf(site) === site ? site : null;
}

/** A remembered speed: a rate on the grid, or nothing. */
export function parseRememberedRate(value: unknown): Rate | null {
  return (validSetting('favoriteRate', value) as Rate | undefined) ?? null;
}

/** Read fail-closed field by field: an invalid field is dropped, the others stay. */
export function parseSiteProfile(value: unknown): SiteProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const record = value as Readonly<Record<string, unknown>>;
  const profile: Record<string, unknown> = {};
  const rate = Object.hasOwn(record, 'playbackRate')
    ? parseRememberedRate(record['playbackRate'])
    : null;
  if (rate !== null) profile['playbackRate'] = rate;
  for (const field of SETTING_FIELDS) {
    if (!Object.hasOwn(record, field)) continue;
    const parsed = validSetting(field, record[field]);
    if (parsed !== undefined) profile[field] = parsed;
  }
  return profile as SiteProfile;
}

/** A profile without fields is no profile: it is removed rather than stored empty. */
export function isEmptyProfile(profile: SiteProfile): boolean {
  return PROFILE_FIELDS.every((field) => profile[field] === undefined);
}

/** The settings that apply on a site: its profile over the general settings. */
export function effectiveSettings(settings: Settings, profile: SiteProfile): Settings {
  const result: Record<string, unknown> = { ...settings };
  for (const field of SETTING_FIELDS) {
    const value = profile[field];
    if (value !== undefined) result[field] = value;
  }
  return result as unknown as Settings;
}

/** The speed to start a site at, given the memory mode; null leaves the site's own speed. */
export function startingRate(
  memory: MemoryMode,
  remembered: Rate | null,
  profile: SiteProfile,
): Rate | null {
  switch (memory) {
    case 'none':
      return null;
    case 'global':
      return remembered;
    case 'site':
      return profile.playbackRate ?? null;
  }
}
