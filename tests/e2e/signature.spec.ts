// Every script the stores receive, for Chromium and for Firefox, opens with the author's signature.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, PRODUCTION_DIR, test } from './fixtures.ts';

function scripts(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(dir, file));
}

for (const dir of [PRODUCTION_DIR, join(PRODUCTION_DIR, '../firefox-mv3')]) {
  test(`every shipped script in ${dir.split('/').at(-1)} is signed by Lionrick333`, () => {
    const files = scripts(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(
        readFileSync(file, 'utf8').startsWith('/*! FleetFoot Engine, made by Lionrick333 */'),
        file,
      ).toBe(true);
    }
  });
}
