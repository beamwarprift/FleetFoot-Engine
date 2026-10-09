// The remembered speed and the site profiles in storage.local: one key for the speed, one key per
// site, read fail-closed. A profile is written by the background only, one patch after another;
// every other page sends it the patch.

import { browser } from 'wxt/browser';
import type { Rate } from '../core/media/PlaybackRate.ts';
import {
  applyPatch,
  type ProfilePatch,
  profilePatchMessage,
} from '../core/settings/ProfilePatch.ts';
import {
  isEmptyProfile,
  parseRememberedRate,
  parseSiteProfile,
  REMEMBERED_RATE_KEY,
  siteOfStorageKey,
  siteStorageKey,
} from '../core/settings/Profiles.ts';
import type { ProfilesPort, SiteEntry } from '../ui/ProfilesPort.ts';

let patches: Promise<void> = Promise.resolve();

/** In the background: applies a validated patch to the stored profile, one after another. */
export function writeProfile(site: string, patch: ProfilePatch): Promise<void> {
  const write = patches.then(async () => {
    const key = siteStorageKey(site);
    const stored = await browser.storage.local.get(key);
    const next = applyPatch(parseSiteProfile(stored[key]), patch);
    if (isEmptyProfile(next)) await browser.storage.local.remove(key);
    else await browser.storage.local.set({ [key]: next });
  });
  // A failed write is reported to its caller and never blocks the next one.
  patches = write.catch(() => {});
  return write;
}

function isProfilesKey(key: string): boolean {
  return key === REMEMBERED_RATE_KEY || siteOfStorageKey(key) !== null;
}

export const storageProfiles: ProfilesPort = {
  async rememberedRate() {
    const stored = await browser.storage.local.get(REMEMBERED_RATE_KEY);
    return parseRememberedRate(stored[REMEMBERED_RATE_KEY]);
  },
  async saveRememberedRate(rate: Rate) {
    await browser.storage.local.set({ [REMEMBERED_RATE_KEY]: rate });
  },
  async profile(site: string) {
    const key = siteStorageKey(site);
    const stored = await browser.storage.local.get(key);
    return parseSiteProfile(stored[key]);
  },
  /** From any page but the background: the background applies the patch and answers true. */
  async update(site: string, patch: ProfilePatch) {
    const applied: unknown = await browser.runtime.sendMessage(profilePatchMessage(site, patch));
    if (applied !== true) throw new Error('profile not saved');
  },
  async list() {
    const stored = await browser.storage.local.get(null);
    const entries: SiteEntry[] = [];
    for (const [key, value] of Object.entries(stored)) {
      const site = siteOfStorageKey(key);
      if (site === null) continue;
      const profile = parseSiteProfile(value);
      if (!isEmptyProfile(profile)) entries.push({ site, profile });
    }
    return entries.sort((a, b) => a.site.localeCompare(b.site));
  },
  watch(onChange) {
    const listener = (changes: Record<string, unknown>, area: string): void => {
      if (area === 'local' && Object.keys(changes).some(isProfilesKey)) onChange();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
};

/** The same port inside the background, which writes itself instead of sending to itself. */
export const backgroundProfiles: ProfilesPort = { ...storageProfiles, update: writeProfile };
