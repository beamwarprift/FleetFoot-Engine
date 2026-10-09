// The code is public and verifiable, under a license that is not open source in the OSI sense:
// no text the user or the public reads may call it so.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const LOCALES = join(ROOT, 'public/_locales');

/** The words for «open source» in the languages the catalogues hold today, and their variants. */
const OPEN_SOURCE = /open[\s-]*source|codice\s+aperto|sorgente\s+aperto/i;

/** Every text the public reads: the interface in every language and the repository's documents. */
const TEXTS: readonly (readonly [string, string])[] = [
  ...readdirSync(LOCALES).map(
    (locale) => [`${locale} catalogue`, join(LOCALES, locale, 'messages.json')] as const,
  ),
  ...['README.md', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'docs/PERMISSIONS.md'].map(
    (file) => [file, join(ROOT, file)] as const,
  ),
];

describe('public wording', () => {
  it('recognises the words it forbids', () => {
    for (const text of ['Open Source', 'open-source', 'opensource', 'codice aperto']) {
      expect(OPEN_SOURCE.test(text), text).toBe(true);
    }
    expect(OPEN_SOURCE.test('public, verifiable code')).toBe(false);
  });

  it.each(TEXTS)('%s never calls the code open source', (_name, path) => {
    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => OPEN_SOURCE.test(line));
    expect(lines).toEqual([]);
  });
});
