// Where the options page reads and changes site access: the browser's permissions in the
// extension, memory in tests. Asking for a permission must happen in the user's click.

import type { AccessMode, SiteAccess } from '../core/settings/Access.ts';

export interface SiteAccessPort {
  read(): Promise<SiteAccess>;
  /** False when the user declined the browser's prompt. */
  setMode(mode: AccessMode): Promise<boolean>;
  addSite(site: string): Promise<boolean>;
  removeSite(site: string): Promise<void>;
  /** Called whenever a permission is granted or revoked, here or in the browser's settings. */
  watch(onChange: () => void): () => void;
}
