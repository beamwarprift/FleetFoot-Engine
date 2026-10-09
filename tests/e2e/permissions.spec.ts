// Site access taken away and given back the way a person does it, on the browser's extensions
// page: the browser's own permissions change, and the extension follows by itself.

import type { Page, Worker } from '@playwright/test';
import { engine, open, state } from './engine.ts';
import { E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';

// Evaluated inside the extension service worker; only the slice used is declared.
declare const chrome: {
  permissions: {
    getAll(): Promise<{ origins?: string[] }>;
    onAdded: { addListener(listener: () => void): void };
    onRemoved: { addListener(listener: () => void): void };
  };
  scripting: { getRegisteredContentScripts(): Promise<Array<{ matches?: string[] }>> };
};
declare const navigator: { locks: { request(name: string, task: () => void): Promise<void> } };
/** Where the worker keeps the wait for the permission change it is about to see. */
interface Waiting {
  ffeChanged?: Promise<void>;
}

// Evaluated on chrome://extensions: the browser's own page for this setting.
interface ExtensionsPage {
  readonly chrome: {
    developerPrivate: {
      updateExtensionConfiguration(update: {
        extensionId: string;
        hostAccess: string;
      }): Promise<void>;
    };
  };
}
declare const window: unknown;

test.use({ extensionDir: E2E_EXTENSION_DIR });

/**
 * Sets the extension's site access on the browser's extensions page, and waits until the
 * background has followed: its own listener asks for the registration lock before this one.
 */
async function siteAccess(page: Page, background: Worker, hostAccess: 'ON_CLICK' | 'ON_ALL_SITES') {
  await background.evaluate((removed) => {
    (globalThis as Waiting).ffeChanged = new Promise<void>((resolve) => {
      const event = removed ? chrome.permissions.onRemoved : chrome.permissions.onAdded;
      event.addListener(() => resolve());
    });
  }, hostAccess === 'ON_CLICK');
  const extensionId = new URL(background.url()).host;
  await page.evaluate(
    ({ extensionId, hostAccess }) =>
      (window as ExtensionsPage).chrome.developerPrivate.updateExtensionConfiguration({
        extensionId,
        hostAccess,
      }),
    { extensionId, hostAccess },
  );
  await background.evaluate(async () => {
    await (globalThis as Waiting).ffeChanged;
    await navigator.locks.request('fleetfoot-engine.site-access', () => {});
  });
}

const registered = (background: Worker) =>
  background.evaluate(async () =>
    (await chrome.scripting.getRegisteredContentScripts()).map((script) => script.matches),
  );

test('access taken away in the browser: the extension stops starting there, and comes back with it', async ({
  context,
  background,
  local,
}) => {
  const settings = await context.newPage();
  await settings.goto('chrome://extensions/');
  const page = await context.newPage();
  const path = '/fixtures/single-video.html';

  await siteAccess(settings, background, 'ON_CLICK');
  expect(
    await background.evaluate(async () => (await chrome.permissions.getAll()).origins),
  ).toEqual([]);
  expect(await registered(background)).toEqual([]);
  const url = await open(page, local.origin, 'single-video');
  // Without access the extension cannot even look into the page.
  await expect(engine(background, url, path, { v: 1, type: 'get-state' })).rejects.toThrow();
  const origin = background.url().slice(0, background.url().lastIndexOf('/'));
  const options = await context.newPage();
  await options.goto(`${origin}/options.html`);
  await expect(options.getByLabel('Only when you call it')).toBeChecked();

  await siteAccess(settings, background, 'ON_ALL_SITES');
  expect(await registered(background)).toEqual([['http://127.0.0.1/*']]);
  await expect(options.getByLabel('Always, on the sites you choose')).toBeChecked();
  await open(page, local.origin, 'single-video');
  expect((await state(background, url, path)).players).toHaveLength(1);
});
