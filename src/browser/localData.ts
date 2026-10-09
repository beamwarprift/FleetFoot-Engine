// The settings copy and the deletion in storage.local: a copy is restored in a single write, not
// one write per value.

import { browser } from 'wxt/browser';
import { backupWrites } from '../core/settings/Backup.ts';
import type { LocalDataPort } from '../ui/LocalDataPort.ts';

export const storageLocalData: LocalDataPort = {
  restore: (backup) => browser.storage.local.set({ ...backupWrites(backup) }),
  clear: () => browser.storage.local.clear(),
};
