// A newer version over an installed one, for real in Chromium: a copy of the build is installed
// in a browser profile, the user's data is saved, the browser closes, the copy gets a higher
// version and the same profile opens again. Everything the user kept is still there, the newer
// version migrates it, and the page script starts by itself on a granted site. Not covered: that
// an update opens no first-run page. Chromium reports every start of an extension loaded from the
// command line as an install (observed in Chromium 141), so only a store-style update would tell.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, chromium, type Page, type Worker } from '@playwright/test';
import { SETTINGS_VERSION } from '../../src/core/settings/Settings.ts';
import { chromiumWithExtension, E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';
import { startServer } from './server.ts';

// Evaluated inside the extension service worker; only the slice used is declared.
declare const chrome: {
  runtime: { getManifest(): { version: string } };
  storage: {
    local: {
      get(keys: null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
    onChanged: {
      addListener(listener: (changes: Record<string, { newValue?: unknown }>) => void): void;
    };
  };
};
declare const navigator: { locks: { request(name: string, task: () => void): Promise<void> } };
// Evaluated inside the page.
interface PageVideo {
  readonly playbackRate: number;
  addEventListener(type: 'ratechange', listener: () => void): void;
}
declare const document: { querySelector(selector: string): PageVideo | null };

const isWelcome = (page: Page) => page.url().endsWith('/welcome.html');

/** The browser on `profile` with the extension at `extension`, and its background. */
async function open(profile: string, extension: string): Promise<[BrowserContext, Worker]> {
  const context = await chromium.launchPersistentContext(profile, chromiumWithExtension(extension));
  const background =
    context.serviceWorkers().find((worker) => worker.url().startsWith('chrome-extension://')) ??
    (await context.waitForEvent('serviceworker'));
  return [context, background];
}

/** The copy's manifest with its version raised: what a store would deliver next. */
function raiseVersion(extension: string): string {
  const path = join(extension, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  const parts = manifest.version.split('.').map(Number);
  parts[parts.length - 1] = (parts.at(-1) ?? 0) + 1;
  manifest.version = parts.join('.');
  writeFileSync(path, JSON.stringify(manifest));
  return manifest.version;
}

test('a newer version keeps what the user kept, migrates it, and starts on granted sites', async () => {
  const extension = mkdtempSync(join(tmpdir(), 'ffe-upgrade-extension-'));
  const profile = mkdtempSync(join(tmpdir(), 'ffe-upgrade-profile-'));
  cpSync(E2E_EXTENSION_DIR, extension, { recursive: true });
  const { server, local } = await startServer();
  try {
    // The install: its first-run page, then the user's data.
    let [context, background] = await open(profile, extension);
    const welcome =
      context.pages().find(isWelcome) ??
      (await context.waitForEvent('page', { predicate: isWelcome }));
    expect(welcome).toBeDefined();
    const kept = {
      rememberedRate: 1.5,
      skipSilence: true,
      silenceRate: 4,
      ratePolicy: 'lock',
      timeSaved: 4321,
      'site:example.com': { playbackRate: 2 },
    };
    await background.evaluate(
      (items) =>
        navigator.locks.request('fleetfoot-engine.settings-migration', () =>
          chrome.storage.local.set(items),
        ),
      kept,
    );
    // The version of the stored layout is gone: only the newer version's migration writes it back.
    await background.evaluate(() => chrome.storage.local.remove('settingsVersion'));
    const before = await background.evaluate(() => chrome.storage.local.get(null));
    const installed = await background.evaluate(() => chrome.runtime.getManifest().version);
    await context.close();

    const version = raiseVersion(extension);
    expect(version).not.toBe(installed);
    [context, background] = await open(profile, extension);
    expect(await background.evaluate(() => chrome.runtime.getManifest().version)).toBe(version);
    const migrated = await background.evaluate(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          const check = () =>
            void chrome.storage.local.get(null).then((stored) => {
              if (stored['settingsVersion'] !== undefined) resolve(stored);
            });
          chrome.storage.onChanged.addListener(check);
          check();
        }),
    );
    expect(migrated).toEqual({ ...before, settingsVersion: SETTINGS_VERSION });

    // The page script registered again, and gives the remembered speed by itself.
    await background.evaluate(() =>
      navigator.locks.request('fleetfoot-engine.site-access', () => {}),
    );
    const page = await context.newPage();
    await page.goto(`${local.origin}/fixtures/single-video.html`);
    const rate = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const video = document.querySelector('video') as PageVideo;
          const check = () => video.playbackRate !== 1 && resolve(video.playbackRate);
          video.addEventListener('ratechange', check);
          check();
        }),
    );
    expect(rate).toBe(1.5);
    await context.close();
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(extension, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
});
