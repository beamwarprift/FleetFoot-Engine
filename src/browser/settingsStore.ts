// Settings in storage.local (never storage.sync): read fail-closed, written one key at a time.

import { browser } from 'wxt/browser';
import {
  migrateSettings,
  parseSettings,
  SETTING_KEYS,
  type SettingKey,
  type Settings,
  validSetting,
} from '../core/settings/Settings.ts';

export async function loadSettings(): Promise<Settings> {
  return parseSettings(await browser.storage.local.get(null));
}

/**
 * Saves one setting after checking it; false when the value is not acceptable. The layout version
 * is left to `migrateStoredSettings`: a save never lowers the one a newer build wrote.
 */
export async function saveSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
): Promise<boolean> {
  const valid = validSetting(key, value);
  if (valid === undefined) return false;
  await browser.storage.local.set({ [key]: valid });
  return true;
}

/** Back to the defaults: the stored values are removed, so later default changes apply too. */
export async function resetSettings(keys: readonly SettingKey[] = SETTING_KEYS): Promise<void> {
  await browser.storage.local.remove([...keys]);
}

/** Calls `onChange` with the full settings whenever one of them changes, from any page. */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string): void => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((key) => (SETTING_KEYS as readonly string[]).includes(key))) {
      return;
    }
    void loadSettings().then(onChange);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Held while the stored settings are migrated; whoever must wait for that asks for it too. */
export const SETTINGS_MIGRATION_LOCK = 'fleetfoot-engine.settings-migration';

/**
 * Runs once per install or update, from the background. The lock is asked for at once, so a
 * migration that has started reads and writes before anyone waiting on the lock touches storage.
 */
export function migrateStoredSettings(): Promise<void> {
  return navigator.locks.request(SETTINGS_MIGRATION_LOCK, async () => {
    const { writes } = migrateSettings(await browser.storage.local.get(null));
    if (Object.keys(writes).length > 0) await browser.storage.local.set(writes);
  });
}
