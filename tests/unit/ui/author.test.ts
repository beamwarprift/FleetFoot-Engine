// The author's name has one source: package.json carries the same one, and the banner that signs
// every shipped script names it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTHOR, SIGNATURE_BANNER } from '../../../src/ui/author.ts';

describe('the author', () => {
  it('is Lionrick333, as package.json says', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../package.json'), 'utf8'),
    );
    expect(AUTHOR).toBe('Lionrick333');
    expect(pkg.author).toBe(AUTHOR);
  });

  it('signs the scripts with a comment that minification keeps', () => {
    expect(SIGNATURE_BANNER).toBe('/*! FleetFoot Engine, made by Lionrick333 */');
  });
});
