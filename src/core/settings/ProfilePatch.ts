// A change to one site's profile, as data: the fields it sets, the ones it clears (null), or the
// whole profile forgotten. Every page sends it to one writer, which applies it to the profile as
// stored at that moment, one after another: two pages changing the same site never lose a field.

import {
  PROFILE_FIELDS,
  type ProfileField,
  parseSiteProfile,
  type SiteProfile,
} from './Profiles.ts';
import { siteOf } from './Sites.ts';

/** Null forgets the whole profile; a field set to null goes back to the general value. */
export type ProfilePatch = { readonly [F in ProfileField]?: SiteProfile[F] | null } | null;

export const PROFILE_PATCH_MESSAGE = 'fleetfoot-engine.profile-patch';

export interface ProfilePatchMessage {
  readonly type: typeof PROFILE_PATCH_MESSAGE;
  readonly site: string;
  readonly patch: ProfilePatch;
}

export function profilePatchMessage(site: string, patch: ProfilePatch): ProfilePatchMessage {
  return { type: PROFILE_PATCH_MESSAGE, site, patch };
}

/** The profile after the patch; fields it does not name stay as they were. */
export function applyPatch(current: SiteProfile, patch: ProfilePatch): SiteProfile {
  if (patch === null) return {};
  const next: Record<string, unknown> = { ...current };
  for (const field of PROFILE_FIELDS) {
    if (!Object.hasOwn(patch, field)) continue;
    const value = patch[field];
    if (value === null) delete next[field];
    else next[field] = value;
  }
  return parseSiteProfile(next);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A patch whose every field is a profile field with a valid value or null; anything else is no patch. */
function parsePatch(value: unknown): ProfilePatch | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length === 0) return undefined;
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(key)) return undefined;
    const field = value[key];
    if (field === null) {
      patch[key] = null;
      continue;
    }
    const parsed = parseSiteProfile({ [key]: field })[key as ProfileField];
    if (parsed === undefined) return undefined;
    patch[key] = parsed;
  }
  return patch as ProfilePatch;
}

/** The message as sent, read fail-closed: an unknown shape, site or field is refused whole. */
export function parseProfilePatch(value: unknown): ProfilePatchMessage | null {
  if (!isRecord(value) || value['type'] !== PROFILE_PATCH_MESSAGE) return null;
  if (Object.keys(value).length !== 3 || !Object.hasOwn(value, 'patch')) return null;
  const site = value['site'];
  if (typeof site !== 'string' || siteOf(site) !== site) return null;
  const patch = parsePatch(value['patch']);
  return patch === undefined ? null : profilePatchMessage(site, patch);
}
