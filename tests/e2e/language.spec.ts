// The interface language the user chooses, in the real extension: its catalogues filled exactly as
// the browser fills them, its pages drawn in that language under the extension's CSP, and each
// part carrying only the texts it shows.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { type Catalogue, fillMessage } from '../../src/ui/catalogue.ts';
import { expect, PRODUCTION_DIR, test } from './fixtures.ts';

// Evaluated inside the extension: only the slice used is declared.
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
  i18n: {
    getMessage(key: string, substitutions: string[]): string;
    getUILanguage(): string;
  };
};
declare const document: {
  readonly documentElement: { readonly lang: string; readonly dir: string };
};

const LOCALES = join(import.meta.dirname, '../../public/_locales');
const catalogue = (name: string): Catalogue<string> =>
  JSON.parse(readFileSync(join(LOCALES, name, 'messages.json'), 'utf8')) as Catalogue<string>;
const text = (name: string, key: string): string => catalogue(name)[key]?.message ?? '';

function extensionBase(workerUrl: string): string {
  return workerUrl.slice(0, workerUrl.lastIndexOf('/'));
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('fills every text of a catalogue exactly as the browser fills it', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  const page = await context.newPage();
  await page.goto(`${origin}/options.html`);
  const english = catalogue('en');
  const keys = Object.keys(english);
  const substitutions = ['§one', '§two', '§three'];
  const browser = await page.evaluate(
    ([names, values]) => ({
      language: chrome.i18n.getUILanguage(),
      texts: names.map((name) => chrome.i18n.getMessage(name, values)),
    }),
    [keys, substitutions] as const,
  );
  // The browser reads its English catalogue here: the comparison is on the same texts.
  expect(browser.language.split('-')[0]).toBe('en');
  const ours = keys.map((key) => {
    const entry = english[key];
    return entry === undefined ? '' : fillMessage(entry, substitutions);
  });
  expect(ours).toEqual(browser.texts);
});

test('draws its pages in the language chosen, and again in the next one chosen', async ({
  context,
  background,
}) => {
  const origin = extensionBase(background.url());
  await background.evaluate(() => chrome.storage.local.set({ language: 'de' }));
  const page = await context.newPage();
  const errors = errorsOf(page);
  await page.goto(`${origin}/options.html`);
  await expect(page.locator('h1 .title')).toHaveText(text('de', 'optionsTitle'));
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
  const language = page.getByLabel(text('de', 'languageField'));
  await expect(language).toHaveValue('de');
  // Chosen on the page: it draws itself again in that language.
  await language.selectOption('it');
  await expect(page.locator('h1 .title')).toHaveText(text('it', 'optionsTitle'));
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('it');

  await background.evaluate(() => chrome.storage.local.set({ language: 'ar' }));
  const popup = await context.newPage();
  const popupErrors = errorsOf(popup);
  // Opened as a tab, the popup's active tab is an extension page: it says it cannot work there.
  await popup.goto(`${origin}/popup.html`);
  await expect(popup.getByText(text('ar', 'pageUnavailableTitle'))).toBeVisible();
  expect(await popup.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(await popup.evaluate(() => document.documentElement.lang)).toBe('ar');
  expect([...errors, ...popupErrors]).toEqual([]);
});

test('the page script and the background carry only their own texts', () => {
  const read = (file: string) => readFileSync(join(PRODUCTION_DIR, file), 'utf8');
  const page = read('media-controller.js');
  const background = read('background.js');
  for (const name of ['de', 'ja', 'ar']) {
    expect(page).toContain(text(name, 'overlayLabel'));
    expect(background).toContain(text(name, 'menuSpeed'));
    for (const part of [page, background]) {
      expect(part).not.toContain(text(name, 'welcomeTitle'));
      expect(part).not.toContain(text(name, 'aboutLicense'));
    }
  }
});
