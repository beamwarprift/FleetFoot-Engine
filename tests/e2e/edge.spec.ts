// The Edge smoke test: the Chromium build in Edge, with `pnpm test:edge` in CI. With the
// checks of smoke.spec.ts, it saves from the options page and starts by itself on a granted page.

import { engine, open, registrationSettled, state } from './engine.ts';
import { E2E_EXTENSION_DIR, expect, test } from './fixtures.ts';

// Evaluated inside the extension service worker; only the slice used is declared.
declare const chrome: {
  storage: { local: { get(keys: string): Promise<Record<string, unknown>> } };
};

test.use({ extensionDir: E2E_EXTENSION_DIR });

test('the options page saves to storage.local', async ({ context, background }) => {
  const origin = background.url().slice(0, background.url().lastIndexOf('/'));
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  await page.getByRole('checkbox', { name: 'Show the overlay on players' }).uncheck();
  await expect(page.locator('footer .status')).toHaveText('Saved.');
  expect(await background.evaluate(() => chrome.storage.local.get('overlayEnabled'))).toEqual({
    overlayEnabled: false,
  });
});

test('starts by itself on a granted page and controls its player', async ({
  context,
  background,
  local,
}) => {
  await registrationSettled(background);
  const page = await context.newPage();
  const url = await open(page, local.origin, 'single-video');
  const path = '/fixtures/single-video.html';
  expect((await state(background, url, path)).players).toHaveLength(1);
  await engine(background, url, path, { v: 1, type: 'set-rate', rate: 2 });
  expect(
    await page.locator('video').evaluate((video: { playbackRate: number }) => video.playbackRate),
  ).toBe(2);
});
