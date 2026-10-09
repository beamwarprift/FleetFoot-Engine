// Where the remembered speed and the site profiles are read and written: storage.local in the
// extension, memory in tests.

import type { Rate } from '../core/media/PlaybackRate.ts';
import type { ProfilePatch } from '../core/settings/ProfilePatch.ts';
import type { SiteProfile } from '../core/settings/Profiles.ts';

export interface SiteEntry {
  readonly site: string;
  readonly profile: SiteProfile;
}

export interface ProfilesPort {
  rememberedRate(): Promise<Rate | null>;
  saveRememberedRate(rate: Rate): Promise<void>;
  profile(site: string): Promise<SiteProfile>;
  /** Applied to the profile as stored when its turn comes; an emptied profile is removed. */
  update(site: string, patch: ProfilePatch): Promise<void>;
  /** Every site with a profile, in alphabetical order. */
  list(): Promise<readonly SiteEntry[]>;
  /** Called when the remembered speed or any profile changes, from any page. */
  watch(onChange: () => void): () => void;
}
