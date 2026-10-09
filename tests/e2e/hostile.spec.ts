// Pages that fight back: the engine keeps working where a page takes over
// playbackRate or forbids everything with its CSP, and a page can neither see the extension nor
// command it.

import { engine, open, rates, registrationSettled, state } from './engine.ts';
import { E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';

interface HostileWindow {
  realRate(): number;
  messages: number;
  attributes(): string;
  tryToCommand(): void;
}

// Evaluated inside the page: only the slice used is declared.
interface PageVideo {
  readonly playbackRate: number;
  changed?: Promise<void>;
  addEventListener(type: 'ratechange', listener: () => void, options?: { once: boolean }): void;
}
declare const window: unknown;
declare const document: { querySelector(selector: string): PageVideo | null };

test.use({ extensionDir: E2E_EXTENSION_DIR });

test.beforeEach(async ({ background }) => {
  await registrationSettled(background);
});

test('a page that takes over playbackRate in its own world cannot stop the speed', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'hostile-prototype');
  const path = '/fixtures/hostile-prototype.html';
  // The page's own getter answers 1 to anyone in its world, so only the event is awaited.
  await page.evaluate(() => {
    const video = document.querySelector('video') as PageVideo;
    video.changed = new Promise((resolve) =>
      video.addEventListener('ratechange', () => resolve(), { once: true }),
    );
  });
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  await page.evaluate(() => (document.querySelector('video') as PageVideo).changed);
  // The page's own getter still lies; the element really plays at 2x, and the engine knows it.
  expect(await page.evaluate(() => (window as unknown as HostileWindow).realRate())).toBe(2);
  expect((await state(background, url, path)).rate).toBe(2);
});

test('a page with the strictest CSP still gets its speed', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'csp-strict');
  const path = '/fixtures/csp-strict.html';
  expect((await state(background, url, path)).players).toHaveLength(1);
  const changed = await rates(page.locator('video'), 1.5);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 1.5 });
  expect(await changed()).toContain(1.5);
});

test('a page sees no sign of the extension: no message, no attribute, no global', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'hostile-listener');
  const path = '/fixtures/hostile-listener.html';
  const changed = await rates(page.locator('video'), 2);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  await changed();
  const seen = await page.evaluate(() => {
    const page = window as unknown as HostileWindow;
    return {
      messages: page.messages,
      attributes: page.attributes(),
      globals: Object.getOwnPropertyNames(window).filter((name) => /fleetfoot/i.test(name)),
    };
  });
  expect(seen).toEqual({ messages: 0, attributes: 'lang', globals: [] });
});

test('a page cannot command the extension with messages or events', async ({
  context,
  background,
  local,
}) => {
  const page = await context.newPage();
  const url = await open(page, local.origin, 'hostile-listener');
  const path = '/fixtures/hostile-listener.html';
  // Every rate the video takes, until the real command's 1.5x arrives after the page's tries.
  const history = await rates(page.locator('video'), 1.5);
  await page.evaluate(() => (window as unknown as HostileWindow).tryToCommand());
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 1.5 });
  expect(await history()).toEqual([1.5]);
});
