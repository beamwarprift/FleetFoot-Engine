// Every interface text exists in every language, with the same placeholders.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionMessageName, SHORTCUT_ACTIONS } from '../../../src/core/settings/Shortcuts.ts';

const LOCALES = join(import.meta.dirname, '../../../public/_locales');

interface Entry {
  readonly message: string;
  readonly description?: string;
  readonly placeholders?: Readonly<Record<string, { readonly content: string }>>;
}

function catalogue(locale: string): Readonly<Record<string, Entry>> {
  return JSON.parse(readFileSync(join(LOCALES, locale, 'messages.json'), 'utf8')) as Record<
    string,
    Entry
  >;
}

const locales = readdirSync(LOCALES);
const english = catalogue('en');

describe('interface texts', () => {
  it('exist in English, the reference, and in Italian; a new language is one more folder', () => {
    expect(locales).toContain('en');
    expect(locales).toContain('it');
  });

  it.each(locales)('%s has exactly the English keys', (locale) => {
    expect(Object.keys(catalogue(locale)).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(locales)('%s uses only the placeholders it declares, numbered in order', (locale) => {
    for (const [key, entry] of Object.entries(catalogue(locale))) {
      expect(entry.message.trim(), key).not.toBe('');
      const used = new Set(
        Array.from(entry.message.matchAll(/\$([A-Za-z_]+)\$/g), (match) => match[1]?.toLowerCase()),
      );
      const declared = Object.keys(entry.placeholders ?? {});
      expect([...used].sort(), key).toEqual([...declared].sort());
      declared.forEach((name, index) => {
        expect(entry.placeholders?.[name]?.content, `${key}.${name}`).toBe(`$${index + 1}`);
      });
      expect(declared, key).toEqual(Object.keys(english[key]?.placeholders ?? {}));
    }
  });

  // A colon announces a value, an example or a list, never joins two sentences: a text may have
  // one only where the English reference announces one too. The store description may list its
  // qualities after a colon in a language that builds it that way.
  const COLON = /:\s|：/;
  const LISTS_AFTER_COLON = new Set(['extensionDescription']);

  it.each(locales)('%s has a colon only where English announces something with one', (locale) => {
    const joined = Object.entries(catalogue(locale))
      .filter(([key, entry]) => COLON.test(entry.message) && !LISTS_AFTER_COLON.has(key))
      .filter(([key]) => !COLON.test(english[key]?.message ?? ''))
      .map(([key]) => key);
    expect(joined).toEqual([]);
  });

  // The manifest description, which the stores show under the name: Chrome takes plain text of at
  // most 132 characters (developer.chrome.com, manifest «description»).
  const DESCRIPTION_MAX = 132;

  it.each(locales)('%s describes the extension within the stores’ limit', (locale) => {
    const description = catalogue(locale)['extensionDescription']?.message ?? '';
    expect(Array.from(description).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  // The texts the manifest shows: a store changes any space but the plain one (Edge replaced the
  // narrow no-break space of the French description), so they keep only plain spaces.
  const MANIFEST_TEXTS = ['extensionDescription', ...SHORTCUT_ACTIONS.map(actionMessageName)];

  it.each(locales)('%s writes the manifest texts with plain spaces only', (locale) => {
    const entries = catalogue(locale);
    for (const key of MANIFEST_TEXTS) {
      expect(entries[key]?.message ?? '', key).not.toMatch(/[^\S ]/u);
    }
  });

  it('name every browser shortcut', () => {
    for (const action of SHORTCUT_ACTIONS) expect(english[actionMessageName(action)]).toBeDefined();
  });
});
