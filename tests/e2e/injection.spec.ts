// The extension starting by itself on a granted site, for real: the E2E build is the production
// build plus host access to 127.0.0.1, so the page script is registered on the local server and
// arrives in the page and its frames. Driven by the page's own shortcuts, as a user would.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import { E2E_EXTENSION_DIR, expect, PRODUCTION_DIR, test } from './fixtures.ts';

// Evaluated callbacks run inside the extension service worker; only the slice they use is declared.
declare const navigator: { locks: { request(name: string, task: () => void): Promise<void> } };
// Evaluated inside the page.
declare const location: { pathname: string };
interface PageVideo {
  readonly playbackRate: number;
  addEventListener(type: 'ratechange', listener: () => void, options: { once: true }): void;
}
declare const chrome: {
  scripting: {
    getRegisteredContentScripts(): Promise<
      Array<{ id: string; matches?: string[]; allFrames?: boolean }>
    >;
    executeScript(options: {
      target: { tabId: number; allFrames: boolean };
      func: () => string;
    }): Promise<Array<{ frameId: number; result?: string }>>;
  };
  tabs: {
    query(info: { url: string }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown, options: { frameId: number }): Promise<unknown>;
  };
};

test.use({ extensionDir: E2E_EXTENSION_DIR });

const manifest = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;

/** Asks the engine of a frame for its state: answered only once the page script is there. */
async function engineState(background: Worker, url: string, path: string) {
  return background.evaluate(
    async ({ url, path }) => {
      const [tab] = await chrome.tabs.query({ url });
      if (tab?.id === undefined) throw new Error('no tab');
      // Which frame shows `path`: read from the frames themselves, no extra permission.
      const frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => location.pathname,
      });
      const frame = frames.find((item) => item.result === path);
      if (frame === undefined) throw new Error(`no frame ${path}`);
      return chrome.tabs.sendMessage(
        tab.id,
        { v: 1, type: 'get-state' },
        { frameId: frame.frameId },
      );
    },
    { url, path },
  );
}

/** Resolves with the next rate the video takes. */
function nextRate(page: Page | ReturnType<Page['frameLocator']>): Promise<number> {
  return page.locator('video').evaluate(
    (video: PageVideo) =>
      new Promise<number>((resolve) => {
        video.addEventListener('ratechange', () => resolve(video.playbackRate), { once: true });
      }),
  );
}

/**
 * Waits for the background's rebuild of the registration, asked for when it starts: the same Web
 * Lock is granted only once that rebuild is over. No polling.
 */
function registrationSettled(background: Worker): Promise<void> {
  return background.evaluate(() =>
    navigator.locks.request('fleetfoot-engine.site-access', () => {}),
  );
}

test.beforeEach(async ({ background }) => {
  await registrationSettled(background);
});

test('the E2E build differs from production only by host access to 127.0.0.1', () => {
  const { host_permissions: hosts, ...rest } = manifest(E2E_EXTENSION_DIR);
  expect(hosts).toEqual(['http://127.0.0.1/*']);
  expect(rest).toEqual(manifest(PRODUCTION_DIR));
});

test('registers the page script on the granted site, for every frame', async ({ background }) => {
  const registered = await background.evaluate(() =>
    chrome.scripting.getRegisteredContentScripts(),
  );
  expect(registered).toEqual([
    expect.objectContaining({
      id: 'fleetfoot-engine',
      allFrames: true,
      matches: ['http://127.0.0.1/*'],
    }),
  ]);
});

test('starts by itself on the page, with its shortcuts ready', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = `${local.origin}/video.html`;
  await page.goto(url);
  const state = (await engineState(background, url, '/video.html')) as {
    state: { players: unknown[]; site: string };
  };
  expect(state.state.site).toBe('127.0.0.1');
  expect(state.state.players).toHaveLength(1);
  const changed = nextRate(page);
  // Focus on the page, as a user's click gives it.
  await page.locator('video').click();
  await page.keyboard.press(']');
  expect(await changed).toBe(1.25);
});

test('starts inside a frame of the page, controlling the player there', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = `${local.origin}/frame.html`;
  await page.goto(url);
  await page.frameLocator('iframe').locator('video').waitFor();
  const state = (await engineState(background, url, '/video.html')) as {
    state: { players: unknown[] };
  };
  expect(state.state.players).toHaveLength(1);
  const frame = page.frameLocator('iframe');
  const changed = nextRate(frame);
  // The keyboard reaches the frame once the user clicks into it.
  await frame.locator('video').click();
  await page.keyboard.press(']');
  expect(await changed).toBe(1.25);
});

test('the options page reads site access from the real permissions', async ({
  context,
  background,
}) => {
  const origin = background.url().slice(0, background.url().lastIndexOf('/'));
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  await expect(page.getByLabel('Always, on the sites you choose')).toBeChecked();
  await expect(page.locator('.sites .site')).toHaveText(['127.0.0.1']);
});
