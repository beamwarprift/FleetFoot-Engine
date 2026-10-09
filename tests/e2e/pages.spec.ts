import type { Page } from '@playwright/test';
import { BROWSER_COMMAND_ACTIONS, SHORTCUT_ACTIONS } from '../../src/core/settings/Shortcuts.ts';
import { expect, test } from './fixtures.ts';

// Evaluated callbacks run inside the extension service worker; only the slice they use is declared.
declare const chrome: {
  storage: {
    local: {
      get(keys: null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: { sendMessage(message: unknown): Promise<unknown> };
  commands: { getAll(): Promise<Array<{ name?: string; shortcut?: string }>> };
};

declare const navigator: {
  locks: { request(name: string, task: () => unknown): Promise<unknown> };
};

// Evaluated inside an extension page: only the slice used is declared.
interface PageElement {
  readonly style: { readonly zoom: string };
}
declare const document: { readonly documentElement: PageElement; readonly body: PageElement };
declare function getComputedStyle(element: PageElement): {
  readonly fontSize: string;
  readonly fontFamily: string;
};

/** `new URL(…).origin` is "null" for the extension scheme in Node: the base comes from the URL. */
function extensionBase(workerUrl: string): string {
  return workerUrl.slice(0, workerUrl.lastIndexOf('/'));
}

/** The names of the accessibility tree's nodes with a role. */
function named(
  nodes: Array<{ role?: { value?: string }; name?: { value?: string } }>,
  role: string,
) {
  return nodes.filter((node) => node.role?.value === role).map((node) => node.name?.value);
}

/** Console errors and uncaught exceptions of a page, CSP violations included. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('the options page loads under the extension CSP and saves to storage.local', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  const errors = errorsOf(page);
  await page.goto(`${origin}/options.html`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FLEETFOOT');
  const overlay = page.getByLabel('Show the overlay on players');
  await expect(overlay).toBeChecked();
  await overlay.uncheck();
  await expect(page.locator('footer .status')).toHaveText('Saved.');
  const stored = await background.evaluate(() => chrome.storage.local.get(null));
  expect(stored).toMatchObject({ overlayEnabled: false, settingsVersion: 1 });
  expect(errors).toEqual([]);
});

test('the extension pages read in their own font, and only the options page takes the text size', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  const errors = errorsOf(page);
  // The text as the page draws it, whatever the browser gives an extension page of its own.
  const font = (target: Page) =>
    target.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        size: body.fontSize === root.fontSize,
        family: body.fontFamily === root.fontFamily,
        zoom: document.documentElement.style.zoom,
      };
    });
  await page.goto(`${origin}/options.html`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FLEETFOOT');
  expect(await font(page)).toEqual({ size: true, family: true, zoom: '1' });
  await page.getByLabel('Text size').selectOption('150');
  await expect(page.locator('footer .status')).toHaveText('Saved.');
  expect((await font(page)).zoom).toBe('1.5');
  const stored = await background.evaluate(() => chrome.storage.local.get(null));
  expect(stored['textSize']).toBe(150);
  // The popup keeps its own size.
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await expect(popup.locator('.brand')).toBeVisible();
  expect(await font(popup)).toEqual({ size: true, family: true, zoom: '' });
  expect(errors).toEqual([]);
});

test('exports the settings to a file, deletes everything, and brings them back from the file', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  const errors = errorsOf(page);
  await page.goto(`${origin}/options.html`);
  await page.getByLabel('Show the overlay on players').uncheck();
  await expect(page.locator('footer .status')).toHaveText('Saved.');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export settings' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^fleetfoot-engine-settings-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const file = await download.path();

  const remove = page.getByRole('button', { name: 'Delete everything on this device' });
  await remove.click();
  await page.getByRole('button', { name: 'Click again to delete everything' }).click();
  await expect(
    page.getByText('Everything FleetFoot Engine kept on this device is deleted.'),
  ).toBeVisible();
  expect(await background.evaluate(() => chrome.storage.local.get(null))).toEqual({});
  await expect(page.getByLabel('Show the overlay on players')).toBeChecked();

  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Settings imported.')).toBeVisible();
  expect(await background.evaluate(() => chrome.storage.local.get(null))).toMatchObject({
    overlayEnabled: false,
    settingsVersion: 1,
  });
  await expect(page.getByLabel('Show the overlay on players')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('each key cross is named for its action in the accessibility tree', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  await expect(page.locator('.key-remove').first()).toBeVisible();
  const session = await context.newCDPSession(page);
  const { nodes } = (await session.send('Accessibility.getFullAXTree')) as {
    nodes: Array<{ role?: { value?: string }; name?: { value?: string }; ignored?: boolean }>;
  };
  const crosses = nodes
    .filter((node) => !node.ignored && node.role?.value === 'button')
    // Substitutions are bidi-isolated (FSI … PDI): compared without the marks.
    .map((node) => (node.name?.value ?? '').replace(/[\u2068\u2069]/g, ''))
    .filter((name) => name.startsWith('Remove the key for '));
  // One per action with a key by default: [ ] \ ' ; and Shift+[ ].
  expect(crosses).toEqual([
    'Remove the key for Slower',
    'Remove the key for Faster',
    'Remove the key for Reset speed to 1×',
    'Remove the key for Favorite speed',
    'Remove the key for Hold for the hold speed',
    'Remove the key for Seek back',
    'Remove the key for Seek forward',
  ]);
  expect(named(nodes, 'table')).toEqual(['Keys on the page']);
  expect(named(nodes, 'rowheader')).toHaveLength(SHORTCUT_ACTIONS.length);
});

test('the popup says when the page does not allow extensions', async ({ context, background }) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  const errors = errorsOf(page);
  // Opened as a tab, the popup's active tab is an extension page: injection is refused.
  await page.goto(`${origin}/popup.html`);
  await expect(page.getByText("FleetFoot Engine can't work on this page.")).toBeVisible();
  expect(errors).toEqual([]);
});

test('the browser shortcuts exist without any key assigned', async ({ background }) => {
  const commands = await background.evaluate(() => chrome.commands.getAll());
  const ours = commands.filter((command) => command.name !== '_execute_action');
  expect(ours.map((command) => command.name).sort()).toEqual([...BROWSER_COMMAND_ACTIONS].sort());
  for (const command of ours) expect(command.shortcut ?? '').toBe('');
});

test('two pages changing the same site at once: every change lands, an invalid one none', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  const answers = await page.evaluate(async () => {
    const send = (patch: unknown) =>
      chrome.runtime.sendMessage({
        type: 'fleetfoot-engine.profile-patch',
        site: 'race.example',
        patch,
      });
    // All sent before any is applied: each would read the profile before the others wrote it.
    return Promise.all([
      send({ playbackRate: 1.5 }),
      send({ preservesPitch: false }),
      send({ seekStep: 30 }),
      send({ holdRate: 2.5 }),
      send({ overlayEnabled: false }),
      send({ ratePolicy: 'lock' }),
      send({ lockFight: 'braked' }),
      send({ playbackRate: 'fast' }),
    ]);
  });
  expect(answers).toEqual([true, true, true, true, true, true, true, undefined]);
  const stored = await background.evaluate(() => chrome.storage.local.get(null));
  expect(stored['site:race.example']).toEqual({
    playbackRate: 1.5,
    preservesPitch: false,
    seekStep: 30,
    holdRate: 2.5,
    overlayEnabled: false,
    ratePolicy: 'lock',
    lockFight: 'braked',
  });
});

test('data another build left: read as far as it goes, and a newer layout never marked older', async ({
  context,
  background,
}) => {
  // What an older build kept, under the layout version a newer build would have written; set
  // under the migration's own lock, so the install's migration runs wholly before or after it.
  await background.evaluate(() =>
    navigator.locks.request('fleetfoot-engine.settings-migration', () =>
      chrome.storage.local.set({
        settingsVersion: 2,
        rateStep: 0.5,
        ratePolicy: 'lock',
        settingFromTheFuture: { nested: true },
        'site:old.example': { playbackRate: 1.75, preservesPitch: false },
      }),
    ),
  );
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  await expect(page.getByLabel('Step for slower and faster')).toHaveValue('0.50');
  await expect(page.getByLabel('Let it go and tell me (recommended)')).toBeChecked();
  await page.getByRole('checkbox', { name: 'Show the overlay on players' }).uncheck();
  await expect(page.locator('footer .status')).toHaveText('Saved.');
  const stored = await background.evaluate(() => chrome.storage.local.get(null));
  expect(stored).toMatchObject({
    settingsVersion: 2,
    overlayEnabled: false,
    settingFromTheFuture: { nested: true },
    'site:old.example': { playbackRate: 1.75, preservesPitch: false },
  });
});

test('on install the first-run page opens by itself, under the CSP and without errors', async ({
  context,
}) => {
  const isWelcome = (page: Page) => page.url().endsWith('/welcome.html');
  const welcome =
    context.pages().find(isWelcome) ??
    (await context.waitForEvent('page', { predicate: isWelcome }));
  const errors = errorsOf(welcome);
  await welcome.reload();
  await expect(welcome.getByRole('heading', { level: 1 })).toContainText('Ready in three steps');
  await expect(welcome.getByLabel('Only when you call it')).toBeChecked();
  await welcome.getByLabel('Favorite speed').fill('1.5');
  await welcome.getByLabel('Favorite speed').press('Enter');
  await welcome.getByLabel('Favorite speed').blur();
  await expect(welcome.locator('footer .status')).toHaveText('Saved.');
  // In its own font, at the size it was drawn with.
  const font = await welcome.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return [body.fontSize === root.fontSize, body.fontFamily === root.fontFamily];
  });
  expect(font).toEqual([true, true]);
  expect(errors).toEqual([]);
});
