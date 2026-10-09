// The first-run page, opened by the background once, on install.

import { browser } from 'wxt/browser';
import { browserLocalization } from '@/src/browser/i18n.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { permissionsSiteAccess } from '@/src/browser/siteAccess.ts';
import { startWelcome } from '@/src/ui/welcome/Welcome.ts';

void startWelcome({
  document,
  l10n: browserLocalization(),
  settings: storageSettings,
  access: permissionsSiteAccess,
  mount: (root) => document.body.append(root),
  close: () =>
    void browser.tabs.getCurrent().then((tab) => {
      if (tab?.id !== undefined) void browser.tabs.remove(tab.id);
    }),
});
