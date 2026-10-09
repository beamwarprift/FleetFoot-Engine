// Where a change made from a page (popup, shortcuts, overlay) is saved. With memory per site, a
// setting a profile can hold goes to that site's profile, so the change shows on the site it was
// made on; otherwise to the general settings. The options page always edits the general ones.

import { isProfileSetting } from '../core/settings/Profiles.ts';
import type { Settings } from '../core/settings/Settings.ts';
import type { SettingChange } from '../core/settings/ShortcutCommands.ts';
import type { ProfilesPort } from './ProfilesPort.ts';
import type { SettingsPort } from './SettingsPort.ts';

export interface PageWritePorts {
  readonly settings: SettingsPort;
  readonly profiles: ProfilesPort;
}

export async function saveFromPage(
  ports: PageWritePorts,
  settings: Settings,
  site: string | null,
  change: SettingChange,
): Promise<void> {
  if (settings.memory === 'site' && site !== null && isProfileSetting(change.key)) {
    await ports.profiles.update(site, { [change.key]: change.value });
    return;
  }
  await ports.settings.save(change.key, change.value);
}
