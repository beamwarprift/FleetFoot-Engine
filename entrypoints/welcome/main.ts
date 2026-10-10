// The first-run page, opened by the background once, on install.

import { browser } from 'wxt/browser';
import { pageLocalization } from '@/src/browser/pageLocalization.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { permissionsSiteAccess } from '@/src/browser/siteAccess.ts';
import { startWelcome } from '@/src/ui/welcome/Welcome.ts';

void storageSettings.load().then(async (settings) =>
  startWelcome({
    document,
    l10n: await pageLocalization(settings.language),
    relocalize: () => location.reload(),
    settings: storageSettings,
    access: permissionsSiteAccess,
    mount: (root) => document.body.append(root),
    close: () =>
      void browser.tabs.getCurrent().then((tab) => {
        if (tab?.id !== undefined) void browser.tabs.remove(tab.id);
      }),
  }),
);
