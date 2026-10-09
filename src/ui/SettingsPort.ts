// Where an interface reads and writes settings: storage.local in the extension, memory in tests.

import type { SettingKey, Settings } from '../core/settings/Settings.ts';

export interface SettingsPort {
  load(): Promise<Settings>;
  save<K extends SettingKey>(key: K, value: Settings[K]): Promise<boolean>;
  watch(onChange: (settings: Settings) => void): () => void;
  /** Every setting back to its default. */
  reset(): Promise<void>;
}
