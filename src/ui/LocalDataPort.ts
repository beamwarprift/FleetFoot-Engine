// Where the options page restores a copy of the settings and deletes everything kept on this
// device: storage.local in the extension, memory in tests.

import type { Backup } from '../core/settings/Backup.ts';

export interface LocalDataPort {
  /** Writes a checked copy at once: its settings, the remembered speed and its sites. */
  restore(backup: Backup): Promise<void>;
  /** Deletes everything FleetFoot Engine keeps on this device; site permissions stay. */
  clear(): Promise<void>;
}
