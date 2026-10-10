// The options page.

import { browser } from 'wxt/browser';
import { browserCapabilities } from '@/src/browser/capabilities.ts';
import { storageLocalData } from '@/src/browser/localData.ts';
import { pageLocalization } from '@/src/browser/pageLocalization.ts';
import { storageProfiles } from '@/src/browser/profilesStore.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { permissionsSiteAccess } from '@/src/browser/siteAccess.ts';
import { storageStats } from '@/src/browser/stats.ts';
import type { BrowserShortcuts } from '@/src/ui/options/keyboardSection.ts';
import type { LayoutMap } from '@/src/ui/options/keyLabel.ts';
import { startOptions } from '@/src/ui/options/Options.ts';

type KeyboardWithLayout = { getLayoutMap(): Promise<LayoutMap> };

/** The user's layout, where the browser exposes it; key names otherwise. */
async function keyboardLayout(): Promise<LayoutMap | null> {
  const keyboard = (navigator as Navigator & { keyboard?: Partial<KeyboardWithLayout> }).keyboard;
  if (typeof keyboard?.getLayoutMap !== 'function') return null;
  try {
    return await keyboard.getLayoutMap();
  } catch {
    return null;
  }
}

const capabilities = browserCapabilities();
type Commands = typeof browser.commands & { openShortcutSettings?: () => Promise<void> };

/** The browser's shortcuts, and the way to their settings where the browser has one. */
function browserShortcuts(): BrowserShortcuts | null {
  if (!capabilities.browserShortcuts) return null;
  const commands = browser.commands as Commands;
  return {
    open:
      typeof commands.openShortcutSettings === 'function'
        ? () => void commands.openShortcutSettings?.()
        : null,
  };
}

void Promise.all([
  keyboardLayout(),
  storageSettings.load().then((settings) => pageLocalization(settings.language)),
]).then(([layout, l10n]) =>
  startOptions({
    document,
    l10n,
    relocalize: () => location.reload(),
    settings: storageSettings,
    layout,
    browserShortcuts: browserShortcuts(),
    contextMenu: capabilities.contextMenu,
    mount: (root) => document.body.append(root),
    stats: storageStats,
    profiles: storageProfiles,
    access: permissionsSiteAccess,
    localData: storageLocalData,
    version: browser.runtime.getManifest().version,
    browserLanguage: browser.i18n.getUILanguage(),
  }),
);
