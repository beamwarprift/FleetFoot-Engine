// The settings port of the extension's contexts: storage.local.

import type { SettingsPort } from '../ui/SettingsPort.ts';
import { loadSettings, resetSettings, saveSetting, watchSettings } from './settingsStore.ts';

export const storageSettings: SettingsPort = {
  load: loadSettings,
  save: saveSetting,
  watch: watchSettings,
  reset: () => resetSettings(),
};
