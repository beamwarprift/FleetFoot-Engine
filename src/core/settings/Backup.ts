// A copy of the settings in a file the user keeps: the settings, the remembered speed
// and the site profiles, never what was watched nor the time saved, which is a count, not a
// setting. Read fail-closed with the same rules as storage: a value that would not be stored is
// not imported.

import type { Rate } from '../media/PlaybackRate.ts';
import {
  isEmptyProfile,
  PROFILE_FIELDS,
  parseRememberedRate,
  parseSiteProfile,
  REMEMBERED_RATE_KEY,
  type SiteProfile,
  siteStorageKey,
} from './Profiles.ts';
import {
  SETTING_KEYS,
  SETTINGS_VERSION,
  type SettingKey,
  type Settings,
  VERSION_KEY,
  validSetting,
} from './Settings.ts';
import { siteOf } from './Sites.ts';

/** What a file says it is, so any other JSON file is refused. */
export const BACKUP_FORMAT = 'fleetfoot-engine-settings';
/** The file layout version; a newer one is refused rather than half understood. */
export const BACKUP_VERSION = 1;
/**
 * The largest file read: the storage.local quota (`QUOTA_BYTES`, 10 485 760 bytes, MDN
 * `storage.local`). A larger copy could never be restored.
 */
export const MAX_BACKUP_BYTES = 10_485_760;

export interface BackupSite {
  readonly site: string;
  readonly profile: SiteProfile;
}

export interface Backup {
  /** Only the settings the file holds; the others stay as they are. */
  readonly settings: Partial<Settings>;
  readonly rememberedRate: Rate | null;
  readonly sites: readonly BackupSite[];
}

export type BackupError = 'too-large' | 'not-json' | 'not-backup' | 'newer-version';

export type BackupRead =
  | { readonly ok: true; readonly backup: Backup; readonly ignored: number }
  | { readonly ok: false; readonly error: BackupError };

/** The file for the current settings, readable by a person too. */
export function writeBackup(
  settings: Settings,
  rememberedRate: Rate | null,
  sites: readonly BackupSite[],
): string {
  // No prototype: a site name can never reach one.
  const profiles: Record<string, SiteProfile> = Object.create(null);
  for (const { site, profile } of sites) {
    if (!isEmptyProfile(profile)) profiles[site] = profile;
  }
  return `${JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      settings,
      rememberedRate,
      sites: profiles,
    },
    null,
    2,
  )}\n`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSettings(value: unknown): { settings: Partial<Settings>; ignored: number } {
  if (!isRecord(value)) return { settings: {}, ignored: value === undefined ? 0 : 1 };
  const settings: Partial<Record<SettingKey, unknown>> = {};
  let ignored = 0;
  for (const key of Object.keys(value)) {
    const known = (SETTING_KEYS as readonly string[]).includes(key);
    const parsed = known ? validSetting(key as SettingKey, value[key]) : undefined;
    if (parsed === undefined) ignored += 1;
    else settings[key as SettingKey] = parsed;
  }
  return { settings: settings as Partial<Settings>, ignored };
}

function readSites(value: unknown): { sites: BackupSite[]; ignored: number } {
  if (!isRecord(value)) return { sites: [], ignored: value === undefined ? 0 : 1 };
  const sites: BackupSite[] = [];
  let ignored = 0;
  for (const [site, raw] of Object.entries(value)) {
    if (siteOf(site) !== site) {
      ignored += 1;
      continue;
    }
    const profile = parseSiteProfile(raw);
    const given = isRecord(raw) ? Object.keys(raw).length : 1;
    const kept = PROFILE_FIELDS.filter((field) => profile[field] !== undefined).length;
    ignored += given - kept;
    if (!isEmptyProfile(profile)) sites.push({ site, profile });
  }
  return { sites: sites.sort((a, b) => a.site.localeCompare(b.site)), ignored };
}

/** A file's text, checked; `ignored` counts the values it held that were not acceptable. */
export function readBackup(text: string): BackupRead {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!isRecord(parsed) || parsed['format'] !== BACKUP_FORMAT) {
    return { ok: false, error: 'not-backup' };
  }
  const version = parsed['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'not-backup' };
  }
  if (version > BACKUP_VERSION) return { ok: false, error: 'newer-version' };
  const settings = readSettings(parsed['settings']);
  const sites = readSites(parsed['sites']);
  const rawRate = parsed['rememberedRate'];
  const rememberedRate = parseRememberedRate(rawRate);
  const rateIgnored = rawRate !== undefined && rawRate !== null && rememberedRate === null ? 1 : 0;
  return {
    ok: true,
    backup: { settings: settings.settings, rememberedRate, sites: sites.sites },
    ignored: settings.ignored + sites.ignored + rateIgnored,
  };
}

/** How many settings and sites a checked backup restores. */
export function backupSize(backup: Backup): { readonly settings: number; readonly sites: number } {
  return { settings: Object.keys(backup.settings).length, sites: backup.sites.length };
}

/** The storage writes that restore a checked backup, all at once. */
export function backupWrites(backup: Backup): Readonly<Record<string, unknown>> {
  const writes: Record<string, unknown> = { ...backup.settings };
  if (Object.keys(backup.settings).length > 0) writes[VERSION_KEY] = SETTINGS_VERSION;
  if (backup.rememberedRate !== null) writes[REMEMBERED_RATE_KEY] = backup.rememberedRate;
  for (const { site, profile } of backup.sites) writes[siteStorageKey(site)] = profile;
  return writes;
}
