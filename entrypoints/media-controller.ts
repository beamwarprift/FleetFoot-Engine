// Injected into a page on demand (scripting.executeScript), never declared in the manifest.
// An unlisted script, not a WXT content script: the WXT content-script context announces itself
// to the page with an event that carries the extension ID.

import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { chosenLocalization } from '@/src/browser/i18n.ts';
import { listenForCommands, serveState } from '@/src/browser/messaging.ts';
import { storageProfiles } from '@/src/browser/profilesStore.ts';
import { storageSettings } from '@/src/browser/settingsPort.ts';
import { extensionShadowRoot } from '@/src/browser/shadowRoots.ts';
import { reportTimeSaved } from '@/src/browser/stats.ts';
import { ensureMediaEngine } from '@/src/core/MediaEngine.ts';
import { startPageSession } from '@/src/page/PageSession.ts';
import { pageCatalogue } from '@/src/page/pageTexts.ts';

const LISTENING: unique symbol = Symbol.for('fleetfoot-engine.listening');

export default defineUnlistedScript(() => {
  const engine = ensureMediaEngine(globalThis, window, {
    onTimeSaved: reportTimeSaved,
    shadowRoot: extensionShadowRoot(),
  });
  const host = globalThis as typeof globalThis & { [LISTENING]?: true };
  if (host[LISTENING] === true) return;
  host[LISTENING] = true;
  listenForCommands((message) => engine.handleMessage(message));
  serveState((listener, options) => engine.subscribe(listener, options));
  void startPageSession({
    window,
    engine,
    settings: storageSettings,
    profiles: storageProfiles,
    l10n: (language) => chosenLocalization(language, pageCatalogue(language)),
  });
});
