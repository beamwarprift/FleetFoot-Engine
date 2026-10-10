// The toolbar popup: immediate control of the page's active player.

import { browser } from 'wxt/browser';
import { pageLocalization } from '@/src/browser/pageLocalization.ts';
import { storageProfiles } from '@/src/browser/profilesStore.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { permissionsSiteAccess } from '@/src/browser/siteAccess.ts';
import { storageStats } from '@/src/browser/stats.ts';
import { connectActiveTab } from '@/src/browser/tabEngine.ts';
import { startPopup } from '@/src/ui/popup/Popup.ts';
import { storeReviewUrl } from '@/src/ui/storeReview.ts';

void storageSettings.load().then(async (settings) =>
  startPopup({
    document,
    l10n: await pageLocalization(settings.language),
    settings: storageSettings,
    profiles: storageProfiles,
    connect: connectActiveTab,
    // The click in the popup is the user gesture the clipboard asks for.
    copy: (text) =>
      navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      ),
    openOptions: () => void browser.runtime.openOptionsPage(),
    // The address the installing store wrote into the manifest says which store that was.
    reviewUrl: storeReviewUrl(browser.runtime.getManifest().update_url, browser.runtime.id),
    mount: (root) => document.body.append(root),
    stats: storageStats,
    access: permissionsSiteAccess,
  }),
);
