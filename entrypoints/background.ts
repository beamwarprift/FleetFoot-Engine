// Light orchestrator: settings migration, site access, the browser's shortcuts and the
// right-click menu. It keeps no state of its own and may stop at any time; listeners are registered at once.

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { browserCapabilities } from '@/src/browser/capabilities.ts';
import { browserLocalization } from '@/src/browser/i18n.ts';
import { backgroundProfiles, writeProfile } from '@/src/browser/profilesStore.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { loadSettings, migrateStoredSettings, watchSettings } from '@/src/browser/settingsStore.ts';
import { syncRegistration } from '@/src/browser/siteAccess.ts';
import { addTimeSaved } from '@/src/browser/stats.ts';
import {
  activeTab,
  connectTab,
  injectEngine,
  sendCommand,
  type TabTarget,
} from '@/src/browser/tabEngine.ts';
import { MENU_RATES } from '@/src/core/media/Presets.ts';
import { makeCommand } from '@/src/core/messages/Protocol.ts';
import {
  MENU_FAVORITE,
  MENU_PARENT,
  menuCommand,
  menuRate,
  menuRateId,
} from '@/src/core/settings/ContextMenu.ts';
import { parseProfilePatch } from '@/src/core/settings/ProfilePatch.ts';
import type { Settings } from '@/src/core/settings/Settings.ts';
import { commandForAction, settingForAction } from '@/src/core/settings/ShortcutCommands.ts';
import { isShortcutAction } from '@/src/core/settings/Shortcuts.ts';
import { parseReport } from '@/src/core/stats/TimeSaved.ts';
import { formatRate } from '@/src/ui/format.ts';
import { saveFromPage } from '@/src/ui/pageWrites.ts';

const MENU_CONTEXTS: ['video', 'audio'] = ['video', 'audio'];

// Menu rebuilds run one after another: interleaved, two would create the same ids.
let menuQueue: Promise<void> = Promise.resolve();
let menuShown: string | null = null;

// Only the APIs this browser has: Firefox for Android has no shortcuts and no right-click menu.
const capabilities = browserCapabilities();

/** Rebuilds the menu when what it shows changed: its switch, the favorite rate. */
function buildMenu(settings: Settings): Promise<void> {
  if (!capabilities.contextMenu) return Promise.resolve();
  const shown = JSON.stringify([settings.contextMenu, settings.favoriteRate]);
  if (shown === menuShown) return menuQueue;
  menuShown = shown;
  menuQueue = menuQueue
    .then(() => createMenu(settings))
    .catch(() => {
      menuShown = null;
    });
  return menuQueue;
}

async function createMenu(settings: Settings): Promise<void> {
  await browser.contextMenus.removeAll();
  if (!settings.contextMenu) return;
  const { t, locale } = browserLocalization();
  browser.contextMenus.create({ id: MENU_PARENT, title: t('menuSpeed'), contexts: MENU_CONTEXTS });
  for (const rate of MENU_RATES) {
    browser.contextMenus.create({
      id: menuRateId(rate),
      parentId: MENU_PARENT,
      title: formatRate(rate, locale),
      contexts: MENU_CONTEXTS,
    });
  }
  browser.contextMenus.create({
    id: MENU_FAVORITE,
    parentId: MENU_PARENT,
    title: t('menuFavorite', formatRate(settings.favoriteRate, locale)),
    contexts: MENU_CONTEXTS,
  });
}

async function runOn(
  target: TabTarget,
  build: (settings: Settings) => Promise<void>,
): Promise<void> {
  if (!(await injectEngine(target))) return;
  await build(await loadSettings());
}

export default defineBackground(() => {
  // The menu and the page script registered on granted sites follow the settings and the
  // permissions; each is rebuilt only from them, never from a copy.
  const excludedSites = async () => (await loadSettings()).excludedSites;
  // Each time the background starts: the registration follows the permissions even if they
  // changed while it slept. Asked for now, before anything else runs.
  void syncRegistration(excludedSites);
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void migrateStoredSettings().then(loadSettings).then(buildMenu);
    // The first-run page, once: never on an update.
    if (reason === 'install')
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });
  browser.runtime.onStartup.addListener(() => {
    void loadSettings().then(buildMenu);
  });
  watchSettings((settings) => {
    void buildMenu(settings);
    void syncRegistration(async () => settings.excludedSites);
  });
  // A permission granted or revoked, here or in the browser's settings.
  const permissionsChanged = (): void => void syncRegistration(excludedSites);
  browser.permissions.onAdded.addListener(permissionsChanged);
  browser.permissions.onRemoved.addListener(permissionsChanged);

  if (capabilities.contextMenu)
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (tab?.id === undefined) return;
      const target = { tabId: tab.id, frameId: info.frameId ?? 0 };
      void runOn(target, async (settings) => {
        const rate = menuRate(info.menuItemId, settings);
        // The media the user clicked, even when another one is playing.
        if (rate !== null) await sendCommand(target, menuCommand(rate, info.srcUrl));
      });
    });

  // Profile patches from any page of this extension, applied one after another. The page script
  // only ever remembers a site's speed, so that is all it may change.
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    const update = parseProfilePatch(message);
    if (update === null) return;
    const fromOurPage = sender.url?.startsWith(browser.runtime.getURL('/')) === true;
    const fields = update.patch === null ? null : Object.keys(update.patch);
    if (!fromOurPage && (fields === null || fields.some((field) => field !== 'playbackRate'))) {
      return;
    }
    writeProfile(update.site, update.patch).then(
      () => sendResponse(true),
      () => sendResponse(false),
    );
    // `true` keeps the channel open for the asynchronous answer.
    return true;
  });

  // Time-saved reports come only from this extension's page script, in a tab.
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id || sender.tab === undefined) return;
    const seconds = parseReport(message);
    if (seconds !== null) void addTimeSaved(seconds);
  });

  if (capabilities.browserShortcuts)
    browser.commands.onCommand.addListener((name, tab) => {
      if (!isShortcutAction(name)) return;
      void (async () => {
        const tabId = tab?.id ?? (await activeTab())?.tabId;
        if (tabId === undefined) return;
        // Every frame of the tab, seen as one: the command reaches the player that matters.
        const client = await connectTab(tabId);
        if (typeof client === 'string') return;
        const settings = await loadSettings();
        const current = await client.send(makeCommand('get-state', {}));
        if (!current.ok) return;
        const { state } = current.response;
        // A setting is saved where the page reads it, like a change from the popup.
        const change = settingForAction(name, settings);
        if (change !== null) {
          await saveFromPage(
            { settings: storageSettings, profiles: backgroundProfiles },
            settings,
            state.site,
            change,
          );
          return;
        }
        const command = commandForAction(name, settings, state);
        if (command !== null) await client.send(command);
      })();
    });
});
